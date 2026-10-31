package com.ani9085.easytravel

import android.app.Application
import com.ani9085.easytravel.work.PriceWatchWorker

class EasyTravelApp : Application() {
    override fun onCreate() {
        super.onCreate()
        PriceWatchWorker.createChannel(this)
    }
}
