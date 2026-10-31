package com.ani9085.easytravel.data

import org.json.JSONArray
import org.json.JSONObject

// assets/destinations.json은 웹 lib/destinations.ts에서 `npm run android:data`로 내보낸 파일이다. 원본은 웹 하나.

data class Phrase(val ko: String, val local: String)

data class DestinationProfile(
    val id: String,
    val country: String,
    val keywords: List<String>,
    val languageName: String,
    val speechLang: String,
    val currency: String?,
    val timeZone: String?,
    val phrases: List<Phrase>
)

data class LanguageOption(val code: String, val name: String, val speechLang: String)

class Destinations(json: String) {
    val profiles: List<DestinationProfile>
    val other: DestinationProfile
    val languages: List<LanguageOption>

    init {
        val data = JSONObject(json)
        val list = data.getJSONArray("profiles")
        profiles = (0 until list.length()).map { profile(list.getJSONObject(it)) }
        other = profile(data.getJSONObject("other"))
        val langs = data.getJSONArray("languages")
        languages = (0 until langs.length()).map {
            val l = langs.getJSONObject(it)
            LanguageOption(l.getString("code"), l.getString("name"), l.getString("speechLang"))
        }
    }

    private fun strings(array: JSONArray?) = if (array == null) emptyList() else (0 until array.length()).map { array.getString(it) }

    private fun profile(p: JSONObject): DestinationProfile {
        val phrases = p.optJSONArray("phrases") ?: JSONArray()
        return DestinationProfile(
            id = p.getString("id"),
            country = p.getString("country"),
            keywords = strings(p.optJSONArray("keywords")),
            languageName = p.getString("languageName"),
            speechLang = p.getString("speechLang"),
            currency = if (p.isNull("currency")) null else p.optString("currency"),
            timeZone = if (p.isNull("timeZone")) null else p.optString("timeZone"),
            phrases = (0 until phrases.length()).map { Phrase(phrases.getJSONObject(it).getString("ko"), phrases.getJSONObject(it).getString("local")) }
        )
    }

    fun profileFor(destination: String): DestinationProfile {
        val value = destination.trim().lowercase()
        if (value.isEmpty()) return other
        return profiles.firstOrNull { profile -> profile.keywords.any { value.contains(it) } } ?: other
    }

    /** 목적지에 맞는 기본 통역 언어. 모르는 목적지는 영어. */
    fun suggestedLanguage(destination: String): LanguageOption {
        val speech = profileFor(destination).speechLang
        return languages.firstOrNull { it.speechLang == speech } ?: languages.first { it.code == "en" }
    }
}
