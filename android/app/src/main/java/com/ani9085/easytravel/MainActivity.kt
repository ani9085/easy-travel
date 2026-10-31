package com.ani9085.easytravel

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.ani9085.easytravel.data.TripCodec
import com.ani9085.easytravel.ui.AppRoot
import com.ani9085.easytravel.ui.AppViewModel
import com.ani9085.easytravel.ui.theme.EasyTravelTheme

class MainActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleLink(intent)
        setContent { EasyTravelTheme { AppRoot(viewModel) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLink(intent)
    }

    /** 보호자 웹의 '부모님 앱으로 보내기' 링크(easytravel://import?d=...)로 열리면 가져오기 확인 화면을 띄운다. */
    private fun handleLink(intent: Intent?) {
        val data = intent?.dataString ?: return
        TripCodec.extractPayload(data)?.let(viewModel::offerImport)
    }
}
