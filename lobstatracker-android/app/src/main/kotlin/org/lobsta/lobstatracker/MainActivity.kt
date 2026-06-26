package org.lobsta.lobstatracker

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private var locationService: LocationService? = null
    private var bound = false

    private lateinit var btnToggle: Button
    private lateinit var btnCopyLog: Button
    private lateinit var btnApply: Button
    private lateinit var btnAudioApply: Button
    private lateinit var etInterval: EditText
    private lateinit var etAudioInterval: EditText
    private lateinit var tvStatus: TextView
    private lateinit var tvLocation: TextView
    private lateinit var tvTime: TextView
    private lateinit var tvLog: TextView
    private lateinit var scrollLog: ScrollView

    private val logLines = mutableListOf<String>()
    private var pendingStartAfterPermission = false

    // 请求前台位置权限 + 后台位置权限
    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            val allGranted = permissions.values.all { it }
            if (allGranted) {
                appendLog("[权限] ✅ 所有位置权限已获取")
            } else {
                val denied = permissions.filter { !it.value }.keys.joinToString(", ")
                appendLog("[权限] ❌ 以下权限被拒绝: $denied")
                tvStatus.text = "❌ 权限被拒绝"
                pendingStartAfterPermission = false
                return@registerForActivityResult
            }

            // Android 13+ → request notification permission
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val notifGranted = ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                if (!notifGranted) {
                    appendLog("[权限] 请求通知权限…")
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    return@registerForActivityResult
                }
            }

            // 权限齐全，自动开始追踪
            if (pendingStartAfterPermission) {
                pendingStartAfterPermission = false
                doStartTracking()
            }
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            appendLog(if (granted) "[通知] ✅ 通知权限已获取" else "[通知] ⚠️ 通知权限被拒绝")
            // 继续开始追踪（通知权限不是必须的）
            if (pendingStartAfterPermission) {
                pendingStartAfterPermission = false
                doStartTracking()
            }
        }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as LocationService.LocalBinder
            locationService = binder.getService()
            bound = true
            locationService?.setUiCallback { status, loc, time, logEntry ->
                updateUI(status, loc, time, logEntry)
            }
            // 预填间隔值
            val svc = locationService
            if (svc != null) {
                etInterval.setText((svc.intervalMs / 1000).toString())
            }

            val fullLogs = locationService?.logs ?: emptyList()
            for (line in fullLogs) {
                appendLog(line)
            }
            // Pre-fill audio interval
            val audioSec = svc?.audioIntervalMs?.div(1000) ?: 60
            etAudioInterval.setText(audioSec.toString())
            updateUI(
                locationService?.lastStatus ?: "就绪",
                locationService?.lastLocation ?: "等待位置…",
                locationService?.lastTime ?: "",
                locationService?.logs?.lastOrNull() ?: ""
            )
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            bound = false
            locationService = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        btnToggle = findViewById(R.id.btn_toggle)
        btnApply = findViewById(R.id.btn_apply)
        btnAudioApply = findViewById(R.id.btn_audio_apply)
        btnCopyLog = findViewById(R.id.btn_copy_log)
        etInterval = findViewById(R.id.et_interval)
        etAudioInterval = findViewById(R.id.et_audio_interval)
        tvStatus = findViewById(R.id.tv_status)
        tvLocation = findViewById(R.id.tv_location)
        tvTime = findViewById(R.id.tv_time)
        tvLog = findViewById(R.id.tv_log)
        scrollLog = findViewById(R.id.scroll_log)

        Intent(this, LocationService::class.java).also { intent ->
            bindService(intent, connection, Context.BIND_AUTO_CREATE)
        }

        btnToggle.setOnClickListener {
            if (locationService?.isRunning == true) {
                stopTracking()
            } else {
                checkAndStart()
            }
        }

        btnApply.setOnClickListener {
            val text = etInterval.text.toString()
            val interval = text.toIntOrNull()
            if (interval != null && interval >= 5) {
                locationService?.updateInterval(interval * 1000L)
                appendLog("[设置] 定位间隔已更新为 ${interval}s")
            } else {
                appendLog("[设置] 请输入 ≥5 的整数")
            }
        }

        btnAudioApply.setOnClickListener {
            val text = etAudioInterval.text.toString()
            val interval = text.toIntOrNull()
            if (interval != null && interval >= 5) {
                locationService?.updateAudioInterval(interval * 1000L)
                appendLog("[设置] 音频间隔已更新为 ${interval}s")
            } else {
                appendLog("[设置] 请输入 ≥5 的整数")
            }
        }

        btnCopyLog.setOnClickListener {
            exportLogs()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (bound) {
            unbindService(connection)
            bound = false
        }
    }

    private fun checkAndStart() {
        pendingStartAfterPermission = true

        val missingPermissions = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            missingPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            missingPermissions.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }

        // Android 10+ 需要后台位置权限用于持续性追踪
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            ) {
                missingPermissions.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                appendLog("[权限] 需要后台位置权限（Android 10+ 要求）")
            }
        }

        if (missingPermissions.isNotEmpty()) {
            appendLog("[权限] 请求权限: ${missingPermissions.joinToString(", ") { it.split(".").last() }}")
            locationPermissionLauncher.launch(missingPermissions.toTypedArray())
            return
        }

        // 权限已齐全
        pendingStartAfterPermission = false
        doStartTracking()
    }

    private fun doStartTracking() {
        locationService?.let { service ->
            service.startTracking()
            btnToggle.text = "⏹ 停止追踪"
            appendLog("[追踪] 已启动")
        }
    }

    private fun stopTracking() {
        locationService?.let { service ->
            service.stopTracking()
            btnToggle.text = "▶ 开始追踪"
        }
    }

    private fun updateUI(status: String, location: String, time: String, logEntry: String) {
        runOnUiThread {
            tvStatus.text = status
            tvLocation.text = location
            tvTime.text = time
            if (logEntry.isNotEmpty()) {
                appendLog(logEntry)
            }
            btnToggle.text = if (locationService?.isRunning == true) "⏹ 停止追踪" else "▶ 开始追踪"
        }
    }

    private fun appendLog(line: String) {
        logLines.add(line)
        if (logLines.size > 150) {
            logLines.removeAt(0)
        }
        tvLog.text = logLines.joinToString("\n")
        scrollLog.post { scrollLog.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun exportLogs() {
        val serviceLogs = locationService?.logs ?: emptyList()
        val allLogs = serviceLogs.toMutableList()

        val header = buildString {
            appendLine("===== LobstaTracker 日志导出 =====")
            appendLine("时间: ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}")
            appendLine("设备: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("App 版本: 1.0.0")
            appendLine("服务状态: ${locationService?.lastStatus}")
            appendLine("最后位置: ${locationService?.lastLocation}")
            appendLine("==================================")
        }

        val fullText = header + allLogs.joinToString("\n")

        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("LobstaTracker Logs", fullText)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, "日志已复制到剪贴板 ✅", Toast.LENGTH_SHORT).show()
        appendLog("[导出] ${allLogs.size} 条日志已复制到剪贴板")
    }
}
