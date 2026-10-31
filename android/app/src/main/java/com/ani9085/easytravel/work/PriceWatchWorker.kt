package com.ani9085.easytravel.work

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.ani9085.easytravel.MainActivity
import com.ani9085.easytravel.R
import com.ani9085.easytravel.data.TripStore
import com.ani9085.easytravel.net.Api
import com.ani9085.easytravel.net.FlightResult
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * 항공 가격 감시: 하루 두 번쯤(12시간 간격) 서버에 물어 목표 금액 이하이면 알림을 띄운다.
 * 안드로이드 절전 정책 때문에 정확한 시각은 보장하지 않는다. 가격·좌석은 조회 시점의 결과다.
 */
class PriceWatchWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val store = TripStore.get(applicationContext)
        val trip = store.trip.value
        val watch = trip.priceWatch
        val profile = trip.profile
        if (!watch.enabled) return Result.success()
        val now = Instant.now().toString()
        if (profile.originIata.length != 3 || profile.destinationIata.length != 3 || profile.startDate.isBlank() || profile.endDate.isBlank()) {
            store.update { it.copy(priceWatch = it.priceWatch.copy(lastCheckedAt = now, lastStatus = "공항 코드와 날짜를 넣어야 확인할 수 있어요.")) }
            return Result.success()
        }
        if (runCatching { LocalDate.parse(profile.startDate).isBefore(LocalDate.now()) }.getOrDefault(false)) {
            store.update { it.copy(priceWatch = it.priceWatch.copy(enabled = false, lastCheckedAt = now, lastStatus = "출발일이 지나 가격 감시를 멈췄어요.")) }
            schedule(applicationContext, false)
            return Result.success()
        }
        return when (val result = Api.searchFlights(profile.originIata, profile.destinationIata, profile.startDate, profile.endDate, profile.travelers)) {
            is FlightResult.Fail -> {
                store.update { it.copy(priceWatch = it.priceWatch.copy(lastCheckedAt = now, lastStatus = result.message)) }
                if (result.code == "flight_provider_not_configured") Result.success() else Result.retry()
            }
            is FlightResult.Ok -> {
                val quote = result.quote
                val status = if (quote == null) "조건에 맞는 항공편을 찾지 못했어요." else "최저 ${money(quote.bestPrice, quote.currency)} (${profile.travelers}명 왕복, ${quote.count}개 중)"
                store.update { it.copy(priceWatch = it.priceWatch.copy(lastCheckedAt = now, lastBestPrice = quote?.bestPrice, lastCurrency = quote?.currency, lastStatus = status)) }
                val target = watch.targetPrice
                if (quote != null && target != null && quote.currency == "KRW" && quote.bestPrice <= target) notify(applicationContext, status)
                Result.success()
            }
        }
    }

    companion object {
        const val CHANNEL = "price"
        private const val WORK = "price-watch"

        fun schedule(context: Context, enabled: Boolean) {
            val manager = WorkManager.getInstance(context)
            if (!enabled) {
                manager.cancelUniqueWork(WORK)
                return
            }
            val request = PeriodicWorkRequestBuilder<PriceWatchWorker>(12, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            manager.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun money(value: Double, currency: String): String =
            if (currency == "KRW") "₩" + NumberFormat.getIntegerInstance(Locale.KOREA).format(value.toLong())
            else NumberFormat.getNumberInstance(Locale.KOREA).apply { maximumFractionDigits = 2 }.format(value) + " " + currency

        private fun notify(context: Context, text: String) {
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val notification = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle("항공 가격이 목표 이하예요")
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText("$text\n조회 시점의 가격이라 예약 화면에서 다시 확인해 주세요."))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()
            NotificationManagerCompat.from(context).notify(1001, notification)
        }

        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(android.app.NotificationChannel(CHANNEL, context.getString(R.string.channel_price), NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
}
