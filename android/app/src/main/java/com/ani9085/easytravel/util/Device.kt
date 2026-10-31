package com.ani9085.easytravel.util

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.widget.Toast
import com.ani9085.easytravel.data.GeoPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.util.Locale
import kotlin.coroutines.resume

/** 다른 앱으로 넘기는 동작. 해당 앱이 없으면 짧게 알려 준다. */
object Actions {
    private const val KAKAO = "com.kakao.talk"

    private fun start(context: Context, intent: Intent): Boolean = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "이 휴대폰에서 열 수 있는 앱이 없어요", Toast.LENGTH_LONG).show()
        false
    }

    private fun mapsUrl(path: String, params: Map<String, String>) =
        "https://www.google.com/maps/$path/?api=1&" + params.entries.joinToString("&") { "${it.key}=${Uri.encode(it.value)}" }

    /** 현재 위치에서 목적지까지 Google 지도 길찾기(앱이 있으면 앱으로) */
    fun directions(context: Context, destination: String) =
        start(context, Intent(Intent.ACTION_VIEW, Uri.parse(mapsUrl("dir", mapOf("destination" to destination.trim())))))

    fun search(context: Context, query: String) =
        start(context, Intent(Intent.ACTION_VIEW, Uri.parse(mapsUrl("search", mapOf("query" to query.trim())))))

    fun location(context: Context, point: GeoPoint) =
        start(context, Intent(Intent.ACTION_VIEW, Uri.parse(mapsUrl("search", mapOf("query" to "${point.lat},${point.lng}")))))

    /** 전화 앱에 번호만 채워 연다. 실제로 거는 것은 사용자가 통화 버튼을 눌러야 한다. */
    fun dial(context: Context, number: String) =
        start(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number.filter { it.isDigit() || it == '+' })))

    fun openUrl(context: Context, url: String) = start(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)))

    /** 카카오톡이 있으면 카톡 친구 고르기로 바로, 없으면 공유 창. 실제로 보냈는지는 알 수 없다. */
    fun shareToFamily(context: Context, text: String): Boolean {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        val kakao = Intent(send).setPackage(KAKAO)
        if (kakao.resolveActivity(context.packageManager) != null && start(context, kakao)) return true
        return start(context, Intent.createChooser(send, "가족에게 알리기"))
    }

    fun mapsLink(point: GeoPoint) = mapsUrl("search", mapOf("query" to "${point.lat},${point.lng}"))
}

/** 기기 음성으로 읽어 주기. 해당 언어 음성이 없으면 false. */
class Speaker(context: Context) : TextToSpeech.OnInitListener {
    private val tts = TextToSpeech(context.applicationContext, this)
    @Volatile private var ready = false

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (ready) tts.setSpeechRate(0.9f)
    }

    fun canSpeak(languageTag: String): Boolean {
        if (!ready) return false
        val result = tts.isLanguageAvailable(Locale.forLanguageTag(languageTag))
        return result >= TextToSpeech.LANG_AVAILABLE
    }

    fun speak(text: String, languageTag: String): Boolean {
        if (!canSpeak(languageTag)) return false
        tts.language = Locale.forLanguageTag(languageTag)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "easy-travel")
        return true
    }

    fun shutdown() = tts.shutdown()
}

object Images {
    /** 사진을 긴 변 1280px JPEG data URL로 줄인다. 다시 그리면서 EXIF(촬영 위치 등)는 빠진다. */
    suspend fun toJpegDataUrl(context: Context, uri: Uri, maxSide: Int = 1280): String? = withContext(Dispatchers.IO) {
        try {
            val resolver = context.contentResolver
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
            val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
                ?: return@withContext null
            val scale = minOf(1f, maxSide.toFloat() / maxOf(decoded.width, decoded.height))
            val bitmap = if (scale < 1f) Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true) else decoded
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
            "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }
}

object Locator {
    /** 사용자가 고른 순간에만 한 번 위치를 받는다. 권한이 없거나 10초 안에 못 받으면 null. */
    @SuppressLint("MissingPermission")
    suspend fun once(context: Context): GeoPoint? {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull {
            try { manager.isProviderEnabled(it) } catch (_: Exception) { false }
        } ?: return null
        val location: Location? = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                withTimeoutOrNull(10_000) {
                    suspendCancellableCoroutine { cont ->
                        val signal = CancellationSignal()
                        cont.invokeOnCancellation { signal.cancel() }
                        manager.getCurrentLocation(provider, signal, context.mainExecutor) { cont.resume(it) }
                    }
                }
            } else {
                manager.getLastKnownLocation(provider)
            } ?: manager.getLastKnownLocation(provider)
        } catch (_: SecurityException) {
            null
        }
        return location?.let { GeoPoint(Math.round(it.latitude * 1e5) / 1e5, Math.round(it.longitude * 1e5) / 1e5, it.accuracy.toInt()) }
    }
}
