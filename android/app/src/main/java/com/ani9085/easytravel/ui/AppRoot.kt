package com.ani9085.easytravel.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.ani9085.easytravel.ui.screens.ArrivalScreen
import com.ani9085.easytravel.ui.screens.HelpScreen
import com.ani9085.easytravel.ui.screens.HomeScreen
import com.ani9085.easytravel.ui.screens.ImportScreen
import com.ani9085.easytravel.ui.screens.MoneyScreen
import com.ani9085.easytravel.ui.screens.PhotoScreen
import com.ani9085.easytravel.ui.screens.PlanScreen
import com.ani9085.easytravel.ui.screens.SetupScreen
import com.ani9085.easytravel.ui.screens.TranslateScreen

@Composable
fun AppRoot(vm: AppViewModel) {
    val trip by vm.trip.collectAsState()
    BackHandler(enabled = vm.screen != Screen.Home) { if (!vm.back()) vm.home() }
    when (vm.screen) {
        Screen.Home -> HomeScreen(vm, trip)
        Screen.Plan -> PlanScreen(vm, trip)
        Screen.Translate -> TranslateScreen(vm, trip)
        Screen.Money -> MoneyScreen(vm, trip)
        Screen.Photo -> PhotoScreen(vm, trip)
        Screen.Arrival -> ArrivalScreen(vm, trip)
        Screen.Help -> HelpScreen(vm, trip)
        Screen.Setup -> SetupScreen(vm, trip)
        Screen.Import -> ImportScreen(vm, trip)
    }
}
