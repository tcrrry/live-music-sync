package org.lobsta.lobstatracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.AudioTrack
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class LocationService : Service() {

    inner class LocalBinder : android.os.Binder() {
        fun getService(): LocationService = this@LocationService
    }

    private val binder = LocalBinder()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private lateinit var locationManager: LocationManager

    private var _isRunning = false
    val isRunning: Boolean get() = _isRunning

    var lastStatus = "就绪"
    var lastLocation = "等待位置…"
    var lastTime = ""

    private val logBuffer = mutableListOf<String>()
    val logs: List<String> get() = logBuffer.toList()

    private var uiCallback: ((String, String, String, String) -> Unit)? = null

    private val prefs by lazy { getSharedPreferences("lobstatracker_prefs", Context.MODE_PRIVATE) }

    private var serverUrl = "https://yourdomain.com/api/status"
    private var tid = "nick"
    var intervalMs = 300_000L
        private set
    var audioIntervalMs = 60_000L
        private set
    private var lastLat: Double? = null
    private var lastLon: Double? = null
    private var lastAccuracy: Float? = null
    private var lastProvider: String? = null
    private var firstFixAchieved = false
    private var lastLocationTime = 0L

    // 轮询控制
    private var pollJob: Job? = null
    private var audioReportJob: Job? = null
    private var gpsTimeoutJob: Job? = null
    private var burstTimeoutJob: Job? = null

    // 当次监听到期自动取消用
    private var gpsListener: LocationListener? = null
    private var networkListener: LocationListener? = null
    private var passiveListenerRef: LocationListener? = null
    private var useGps = true



    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        createNotificationChannel()

        log("===== LobstaTracker v1.0.0 =====")
        log("设备: ${Build.MANUFACTURER} ${Build.MODEL}")
        log("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")

        for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
            try {
                log("[检测] $p: ${if (locationManager.isProviderEnabled(p)) "可用" else "不可用"}")
            } catch (e: Exception) {
                log("[检测] $p: 异常 ${e.message}")
            }
        }

        val savedInterval = prefs.getLong("interval_ms", 3_600_000L)
        if (savedInterval != 3_600_000L) {
            intervalMs = savedInterval
            log("已恢复保存的定位间隔: ${savedInterval / 1000}s")
        }
        val savedAudio = prefs.getLong("audio_interval_ms", 60_000L)
        if (savedAudio != 60_000L) {
            audioIntervalMs = savedAudio
            log("已恢复保存的音频间隔: ${savedAudio / 1000}s")
        }
    }

    override fun onBind(intent: Intent?): IBinder = binder

    fun setUiCallback(callback: (String, String, String, String) -> Unit) {
        uiCallback = callback
        uiCallback?.invoke(lastStatus, lastLocation, lastTime, logBuffer.lastOrNull() ?: "")
    }

    fun updateInterval(ms: Long) {
        intervalMs = ms
        prefs.edit().putLong("interval_ms", ms).apply()
        if (_isRunning) {
            startForeground(NOTIFICATION_ID, createNotification())
        }
        log("定位间隔已更新为 ${ms / 1000}s")
    }

    fun updateAudioInterval(ms: Long) {
        audioIntervalMs = ms
        prefs.edit().putLong("audio_interval_ms", ms).apply()
        if (_isRunning) {
            startAudioReport()
        }
        log("音频间隔已更新为 ${ms / 1000}s")
    }

    fun startTracking() {
        if (_isRunning) return
        _isRunning = true
        firstFixAchieved = false
        lastLat = null
        lastLon = null
        useGps = true
        removeAllListeners()

        startForeground(NOTIFICATION_ID, createNotification())
        status("📍 获取位置中…")
        log("===== 开始追踪 =====")
        log("服务器: $serverUrl, TID: $tid, 间隔: ${intervalMs / 1000}s")

        // 首次注册 GPS + PASSIVE
        registerListeners()

        // GPS 超时 30s → 加网络定位
        gpsTimeoutJob = scope.launch {
            delay(30_000)
            if (_isRunning && !firstFixAchieved) {
                log("[超时] GPS 30s 无定位，添加网络定位")
                useGps = false
                addNetworkListener()
            }
        }
    }

    /**
     * 注册 GPS + PASSIVE listener。
     * 拿到位置 → 立即取消所有监听 → 等 interval 后下一轮
     * 拿不到 → GPSS_BURST_SEC 后强制关闭 → 等够 interval 再下一轮
     */
    private fun registerListeners() {
        if (!_isRunning) return
        removeAllListeners()
        burstTimeoutJob?.cancel()

        var hasProvider = false

        // 1) GPS
        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            hasProvider = true
            gpsListener = createSdlListener("GPS")
            try {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    intervalMs, 0f, gpsListener!!, Looper.getMainLooper()
                )
                log("[GPS] listener 注册成功 (burst ${GPS_BURST_SEC}s)")
            } catch (e: SecurityException) {
                log("[GPS] ❌ 权限不足")
                _isRunning = false
                return
            } catch (e: Exception) {
                log("[GPS] ❌ ${e.message}")
            }
        } else {
            log("[GPS] GPS 不可用，直接使用网络")
            useGps = false
        }

        // 2) PASSIVE
        try {
            if (locationManager.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
                val pl = createSdlListener("PASSIVE")
                passiveListenerRef = pl
                locationManager.requestLocationUpdates(
                    LocationManager.PASSIVE_PROVIDER, 0L, 0f, pl, Looper.getMainLooper()
                )
                log("[PASSIVE] 已注册")
            }
        } catch (_: Exception) {}

        if (!hasProvider && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            addNetworkListener()
        }

        // 3) 爆发超时：GPS_BURST_SEC 内未定位 → 强制关闭，等下一轮
        burstTimeoutJob = scope.launch {
            delay(TimeUnit.SECONDS.toMillis(GPS_BURST_SEC))
            if (_isRunning) {
                log("[省电] GPS burst ${GPS_BURST_SEC}s 到期未定位，关闭 listener")
                removeAllListeners()
                // 等够剩余时间再试
                delay(intervalMs - TimeUnit.SECONDS.toMillis(GPS_BURST_SEC))
                if (_isRunning) registerListeners()
            }
        }
    }

    private fun addNetworkListener() {
        if (!locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            log("[网络] NETWORK 不可用")
            return
        }
        networkListener = createSdlListener("网络")
        try {
            locationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                intervalMs, 0f, networkListener!!, Looper.getMainLooper()
            )
            log("[网络] listener 已注册 (burst ${NET_BURST_SEC}s)")
            // 网络定位 burst 超时
            scope.launch {
                delay(TimeUnit.SECONDS.toMillis(NET_BURST_SEC))
                if (_isRunning) {
                    log("[省电] 网络 burst ${NET_BURST_SEC}s 到期，关闭")
                    networkListener?.let { try { locationManager.removeUpdates(it) } catch(_:Exception){} }
                    networkListener = null
                }
            }
        } catch (e: SecurityException) {
            log("[网络] ❌ 权限不足")
        } catch (e: Exception) {
            log("[网络] ❌ ${e.message}")
        }
    }

    /**
     * 创建 listener，在收到位置后自动进入下一轮。
     */
    private fun createSdlListener(label: String): LocationListener {
        return object : LocationListener {
            override fun onLocationChanged(location: Location) {
                log("[定位] ✅ $label 定位成功: ${location.provider} ${location.latitude},${location.longitude}")

                // 取消当前所有监听
                removeAllListeners()
                gpsTimeoutJob?.cancel()
                gpsTimeoutJob = null

                // 处理位置
                onNewLocation(location)

                if (!firstFixAchieved) {
                    firstFixAchieved = true
                    status("📍 追踪中 (${intervalMs / 1000}s 间隔)")
                    startAudioReport()
                }

                // 等 interval 后再注册下一轮
                pollJob?.cancel()
                pollJob = scope.launch {
                    delay(intervalMs)
                    if (_isRunning) registerListeners()
                }
            }

            override fun onProviderDisabled(p: String) {
                log("[$label] $p 被禁用")
                if (!_isRunning) return
                // 如果 GPS 被禁用且还没定位，切网络
                if (p == LocationManager.GPS_PROVIDER && !firstFixAchieved && useGps) {
                    useGps = false
                    addNetworkListener()
                }
            }

            override fun onProviderEnabled(p: String) {}
            override fun onStatusChanged(p: String, status: Int, extras: Bundle?) {}
        }
    }

    private fun removeAllListeners() {
        burstTimeoutJob?.cancel()
        gpsListener?.let {
            try { locationManager.removeUpdates(it) } catch (_: Exception) {}
        }
        gpsListener = null
        networkListener?.let {
            try { locationManager.removeUpdates(it) } catch (_: Exception) {}
        }
        networkListener = null
        passiveListenerRef?.let {
            try { locationManager.removeUpdates(it) } catch (_: Exception) {}
        }
        passiveListenerRef = null
    }

    fun stopTracking() {
        if (!_isRunning) return
        _isRunning = false

        pollJob?.cancel()
        pollJob = null
        audioReportJob?.cancel()
        audioReportJob = null
        gpsTimeoutJob?.cancel()
        gpsTimeoutJob = null
        removeAllListeners()

        stopForeground(STOP_FOREGROUND_REMOVE)
        status("⏹ 已停止")
        log("===== 追踪已停止 =====")
    }

    private fun onNewLocation(location: Location) {
        if (!_isRunning) return

        lastLat = location.latitude
        lastLon = location.longitude
        lastAccuracy = location.accuracy
        lastProvider = location.provider
        lastLocationTime = location.time

        val ts = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val locStr = "%.6f, %.6f".format(location.latitude, location.longitude)
        val accStr = "精度 ±%.1fm".format(location.accuracy)
        val source = when (location.provider) {
            LocationManager.GPS_PROVIDER -> "🛰 GPS"
            LocationManager.NETWORK_PROVIDER -> "📡 网络"
            else -> "📡 ${location.provider}"
        }

        log("[位置] $source — $locStr (${accStr})")
        updateDisplay(locStr, "$ts  |  $accStr  |  $source")
        sendLocation()
    }

    private fun sendLocation() {
        val lat = lastLat ?: return
        val lon = lastLon ?: return

        scope.launch {
            val payload = JSONObject()
            payload.put("_type", "location")
            payload.put("lat", lat)
            payload.put("lon", lon)
            payload.put("acc", lastAccuracy ?: 0)
            payload.put("t", System.currentTimeMillis() / 1000)
            payload.put("tid", tid)
            payload.put("provider", lastProvider ?: "unknown")
            payload.put("batt", getBatteryLevel())
            payload.put("bt_device", getAudioDeviceName())
            payload.put("token", "YOUR_PUSH_TOKEN")

            // 音频信息
            val audioInfo = getMediaPlaybackInfo()
            for (key in audioInfo.keys()) {
                payload.put(key, audioInfo.get(key))
            }
            val volInfo = getVolumeInfo()
            for (key in volInfo.keys()) {
                payload.put(key, volInfo.get(key))
            }
            val specInfo = getAudioOutputSpecs()
            for (key in specInfo.keys()) {
                payload.put(key, specInfo.get(key))
            }

            fun doSend(): Boolean {
                try {
                    val conn = URL(serverUrl).openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.connectTimeout = 15000
                    conn.readTimeout = 15000
                    OutputStreamWriter(conn.outputStream).use { w -> w.write(payload.toString()); w.flush() }
                    val ok = conn.responseCode == 200
                    conn.disconnect()
                    return ok
                } catch (e: Exception) { return false }
            }

            if (doSend()) {
                log("[发送] ✅ 成功")
            } else {
                log("[发送] ❌ 失败，即将重试…")
                delay(2000)
                if (doSend()) log("[发送] ✅ 重试成功")
                else log("[发送] ❌ 重试也失败")
            }
        }
    }

    /** 每15秒上报一次音频状态（不耗电，不含GPS） */
    private fun startAudioReport() {
        audioReportJob?.cancel()
        audioReportJob = scope.launch {
            while (isActive) {
                delay(audioIntervalMs)
                if (_isRunning) sendAudioStatus()
            }
        }
        log("[音频] 状态上报已启动 (${audioIntervalMs / 1000}s)")
    }

    private fun sendAudioStatus() {
        scope.launch {
            val payload = JSONObject()
            payload.put("_type", "audio")
            payload.put("t", System.currentTimeMillis() / 1000)
            payload.put("tid", tid)
            payload.put("token", "YOUR_PUSH_TOKEN")
            payload.put("bt_device", getAudioDeviceName())

            val audioInfo = getMediaPlaybackInfo()
            for (key in audioInfo.keys()) {
                payload.put(key, audioInfo.get(key))
            }
            val volInfo = getVolumeInfo()
            for (key in volInfo.keys()) {
                payload.put(key, volInfo.get(key))
            }
            val specInfo = getAudioOutputSpecs()
            for (key in specInfo.keys()) {
                payload.put(key, specInfo.get(key))
            }

            try {
                val conn = URL(serverUrl).openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                OutputStreamWriter(conn.outputStream).use { w -> w.write(payload.toString()); w.flush() }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {}
        }
    }

    private fun getAudioDeviceName(): String {
        return try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            log("[音频] 检测到 " + devices.size + " 个输出设备")
            val audioTypes = setOf(
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                AudioDeviceInfo.TYPE_USB_HEADSET,
                AudioDeviceInfo.TYPE_USB_DEVICE,
            )
            for (d in devices) {
                val name = d.productName?.toString() ?: ""
                if (d.type in audioTypes && name.isNotBlank()) {
                    log("[音频] 发现: " + name)
                    return name
                }
            }
            ""
        } catch (e: Exception) {
            log("[音频] 错误: " + (e.message ?: ""))
            ""
        }
    }

    /**
     * 读取当前播放曲目进度、歌名、歌手（通过 MediaSession）
     * 需要通知监听权限才能读到第三方 App 的播放信息
     */
    private fun getMediaPlaybackInfo(): JSONObject {
        val info = JSONObject()
        try {
            val msm = getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val cn = ComponentName(this, MediaListenerService::class.java)
            val controllers = msm.getActiveSessions(cn)
            for (ctl in controllers) {
                val pkg = ctl.packageName ?: continue
                if (pkg == packageName || pkg.startsWith("com.android.") || pkg.startsWith("android."))
                    continue

                val ps = ctl.playbackState
                val meta = ctl.metadata

                if (ps != null) {
                    info.put("audio_position_ms", ps.position)
                    info.put("audio_state", when (ps.state) {
                        PlaybackState.STATE_PLAYING -> "playing"
                        PlaybackState.STATE_PAUSED -> "paused"
                        PlaybackState.STATE_STOPPED,
                        PlaybackState.STATE_NONE -> "stopped"
                        else -> "buffering"
                    })
                    info.put("audio_speed", ps.playbackSpeed.toDouble())
                }

                if (meta != null) {
                    val track = meta.getString(MediaMetadata.METADATA_KEY_TITLE) ?: ""
                    val artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: ""
                    val duration = meta.getLong(MediaMetadata.METADATA_KEY_DURATION)
                    info.put("audio_track", track)
                    info.put("audio_artist", artist)
                    if (duration > 0) info.put("audio_duration_ms", duration)
                }

                // 已有数据就停止遍历
                if (info.has("audio_state") || info.has("audio_track")) break
            }
        } catch (e: Exception) {
            log("[媒体] 读取播放信息失败: " + (e.message ?: ""))
        }
        return info
    }

    private fun getVolumeInfo(): JSONObject {
        val info = JSONObject()
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            info.put("volume", current)
            info.put("volume_max", max)
            info.put("volume_pct", if (max > 0) current * 100 / max else 0)
        } catch (e: Exception) {
            log("[音量] 获取失败: " + (e.message ?: ""))
        }
        return info
    }

    /**
     * 读取当前音频输出设备的硬件规格（采样率、声道数、编码格式）
     */
    private fun getAudioOutputSpecs(): JSONObject {
        val info = JSONObject()
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val audioTypes = setOf(
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                AudioDeviceInfo.TYPE_USB_HEADSET,
                AudioDeviceInfo.TYPE_USB_DEVICE,
            )
            for (d in devices) {
                if (d.type !in audioTypes) continue
                val sr: IntArray = d.sampleRates
                if (sr.isNotEmpty()) {
                    info.put("audio_sr", sr.joinToString("/"))
                    val maxSr = sr.maxOrNull()
                    if (maxSr != null) info.put("audio_sr_max", maxSr)
                }
                val ch: IntArray = d.channelCounts
                if (ch.isNotEmpty()) {
                    info.put("audio_ch", ch.joinToString("/"))
                    val maxCh = ch.maxOrNull()
                    if (maxCh != null) {
                        info.put("audio_ch_mode", when (maxCh) {
                            1 -> "mono"
                            2 -> "stereo"
                            3 -> "2.1"
                            4 -> "quad"
                            6 -> "5.1"
                            8 -> "7.1"
                            else -> "${maxCh}ch"
                        })
                    }
                }
                val enc: IntArray = d.encodings
                if (enc.isNotEmpty()) {
                    val encNames = mutableListOf<String>()
                    for (e in enc) {
                        val name = when (e) {
                            AudioFormat.ENCODING_PCM_8BIT -> "PCM8"
                            AudioFormat.ENCODING_PCM_16BIT -> "PCM16"
                            AudioFormat.ENCODING_PCM_FLOAT -> "Float"
                            AudioFormat.ENCODING_AC3 -> "AC3"
                            AudioFormat.ENCODING_E_AC3 -> "E-AC3"
                            AudioFormat.ENCODING_DTS -> "DTS"
                            AudioFormat.ENCODING_DTS_HD -> "DTS-HD"
                            AudioFormat.ENCODING_MP3 -> "MP3"
                            AudioFormat.ENCODING_OPUS -> "Opus"
                            else -> null
                        }
                        if (name != null) encNames.add(name)
                    }
                    if (encNames.isNotEmpty()) info.put("audio_enc", encNames.joinToString("/"))
                }
                info.put("audio_dev_type", deviceTypeToString(d.type))
                break
            }
            // 获取当前实际输出采样率（尝试三种方式）
            var actualSr = 0
            // 1) AudioManager 属性
            try {
                val srProp = am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)
                if (srProp != null && srProp.isNotEmpty()) {
                    val sr = srProp.toIntOrNull()
                    if (sr != null && sr > 0) actualSr = sr
                }
            } catch (_: Exception) {}
            // 2) AudioTrack native (混音器速率，通常 48000)
            if (actualSr == 0) {
                try {
                    actualSr = AudioTrack.getNativeOutputSampleRate(AudioManager.STREAM_MUSIC)
                } catch (_: Exception) {}
            }
            // 3) 尝试从系统属性获取 USB 直出采样率 (Android 14+ 可用)
            if (actualSr == 48000) {
                try {
                    val cls = Class.forName("android.media.AudioSystem")
                    val m = cls.getMethod("getOutputSampleRate", Int::class.javaPrimitiveType)
                    val apiSr = m.invoke(null, AudioManager.STREAM_MUSIC) as? Int
                    if (apiSr != null && apiSr > 0 && apiSr != 48000) actualSr = apiSr
                } catch (_: Exception) {}
            }
            if (actualSr > 0) info.put("audio_sr_actual", actualSr)
        } catch (e: Exception) {
            log("[音频输出] 获取规格失败: " + (e.message ?: ""))
        }
        return info
    }

    private fun deviceTypeToString(type: Int): String {
        return when (type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "mic"
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
            AudioDeviceInfo.TYPE_LINE_ANALOG -> "line_analog"
            AudioDeviceInfo.TYPE_LINE_DIGITAL -> "line_digital"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bt_sco"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bt_a2dp"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
            AudioDeviceInfo.TYPE_USB_DEVICE -> "usb_device"
            AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb_accessory"
            AudioDeviceInfo.TYPE_DOCK -> "dock"
            AudioDeviceInfo.TYPE_HDMI -> "hdmi"
            AudioDeviceInfo.TYPE_HDMI_ARC -> "hdmi_arc"
            AudioDeviceInfo.TYPE_TELEPHONY -> "telephony"
            AudioDeviceInfo.TYPE_AUX_LINE -> "aux_line"
            AudioDeviceInfo.TYPE_IP -> "ip"
            AudioDeviceInfo.TYPE_BUS -> "bus"
            else -> "unknown($type)"
        }
    }
    private fun getBatteryLevel(): Int {
        return try {
            val intent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            if (intent != null) {
                val lv = intent.getIntExtra("level", -1)
                val sc = intent.getIntExtra("scale", -1)
                if (lv >= 0 && sc > 0) (100 * lv / sc) else -1
            } else -1
        } catch (_: Exception) { -1 }
    }

    private fun status(s: String) { lastStatus = s; uiCallback?.invoke(lastStatus, lastLocation, lastTime, logBuffer.lastOrNull() ?: "") }
    private fun updateDisplay(loc: String, time: String) { lastLocation = loc; lastTime = time; uiCallback?.invoke(lastStatus, lastLocation, lastTime, logBuffer.lastOrNull() ?: "") }

    private fun log(msg: String) {
        val ts = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val entry = "[$ts] $msg"
        logBuffer.add(entry)
        if (logBuffer.size > 200) logBuffer.removeAt(0)
        uiCallback?.invoke(lastStatus, lastLocation, lastTime, entry)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "位置追踪", NotificationManager.IMPORTANCE_LOW)
            ch.description = "后台位置追踪服务"
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("LobstaTracker")
            .setContentText(if (_isRunning) "📍 追踪中 (${intervalMs / 1000}s)" else "⏹ 已停止")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (_isRunning) stopTracking()
        scope.cancel()
    }

    companion object {
        /** GPS 最多连续工作秒数，超时强制关闭以省电 */
        private const val GPS_BURST_SEC = 30L
        /** 网络定位最多连续工作秒数（网络比 GPS 快） */
        private const val NET_BURST_SEC = 5L
        private const val CHANNEL_ID = "lobstatracker_location"
        private const val NOTIFICATION_ID = 1001
    }
}
