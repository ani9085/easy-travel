package com.ani9085.easytravel.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

// 웹 lib/trip.ts의 날짜 검증·"오늘" 계산과 같은 규칙. 잘못된 날짜를 다른 값으로 덮어쓰지 않는다.

const val MAX_TRIP_DAYS = 30
const val MAX_TRAVELERS = 12
const val MAX_JOURNAL_EVENTS = 200

sealed interface DateCheck {
    data class Ok(val days: Int, val assumed: Boolean) : DateCheck
    data class Error(val message: String) : DateCheck
}

private fun parseDate(value: String): LocalDate? = try {
    if (Regex("""\d{4}-\d{2}-\d{2}""").matches(value)) LocalDate.parse(value) else null
} catch (_: DateTimeParseException) {
    null
}

fun checkDates(profile: TripProfile): DateCheck {
    if (profile.startDate.isBlank() && profile.endDate.isBlank()) return DateCheck.Ok(3, assumed = true)
    if (profile.startDate.isBlank() || profile.endDate.isBlank()) return DateCheck.Error("출발일과 귀국일을 모두 넣어 주세요.")
    val start = parseDate(profile.startDate) ?: return DateCheck.Error("날짜 형식을 확인해 주세요.")
    val end = parseDate(profile.endDate) ?: return DateCheck.Error("날짜 형식을 확인해 주세요.")
    if (end.isBefore(start)) return DateCheck.Error("귀국일이 출발일보다 빨라요. 날짜를 다시 확인해 주세요.")
    val days = ChronoUnit.DAYS.between(start, end).toInt() + 1
    if (days > MAX_TRIP_DAYS) return DateCheck.Error("여행 기간은 ${MAX_TRIP_DAYS}일 이하로 넣어 주세요. (지금 ${days}일)")
    return DateCheck.Ok(days, assumed = false)
}

fun periodLabel(profile: TripProfile): String {
    if (profile.startDate.isBlank() && profile.endDate.isBlank()) return "날짜 미정"
    return "${profile.startDate.replace('-', '.')} ~ ${profile.endDate.replace('-', '.')}"
}

sealed interface Timeline {
    data object Undated : Timeline
    data class Before(val daysUntil: Int) : Timeline
    data class During(val day: Int, val totalDays: Int) : Timeline
    data object After : Timeline
}

/** 목적지 시간대(없으면 기기 시간대) 기준으로 여행 전·중·후와 오늘이 며칠째인지. */
fun timeline(profile: TripProfile, now: Instant, zone: ZoneId): Timeline {
    val check = checkDates(profile)
    if (check !is DateCheck.Ok || check.assumed) return Timeline.Undated
    val today = now.atZone(zone).toLocalDate()
    val start = LocalDate.parse(profile.startDate)
    val end = LocalDate.parse(profile.endDate)
    return when {
        today.isBefore(start) -> Timeline.Before(ChronoUnit.DAYS.between(today, start).toInt())
        today.isAfter(end) -> Timeline.After
        else -> Timeline.During(ChronoUnit.DAYS.between(start, today).toInt() + 1, check.days)
    }
}

fun stageLabel(timeline: Timeline): String = when (timeline) {
    is Timeline.Before -> "출발까지 ${timeline.daysUntil}일"
    is Timeline.During -> "여행 ${timeline.day}일째"
    Timeline.After -> "귀국 후"
    Timeline.Undated -> "날짜 미정"
}

/** "다음 일정": 여행 중이면 오늘 Day의 끝나지 않은 첫 장소, 아니면 가장 이른 Day의 첫 장소. */
fun nextItem(items: List<ItineraryItem>, timeline: Timeline): ItineraryItem? {
    val open = items.filter { it.status.isOpen }
    if (timeline is Timeline.During) {
        open.firstOrNull { it.day == timeline.day }?.let { return it }
        open.filter { it.day > timeline.day }.minByOrNull { it.day }?.let { return it }
    }
    return open.minByOrNull { it.day }
}

fun todayDay(timeline: Timeline, fallback: ItineraryItem?): Int =
    if (timeline is Timeline.During) timeline.day else fallback?.day ?: 1

fun Trip.withStatus(id: String, status: ItemStatus, now: String): Trip =
    copy(itinerary = itinerary.map { if (it.id == id) it.copy(status = status, statusAt = now) else it }, updatedAt = now)

fun Trip.withEvent(event: JournalEvent): Trip = copy(
    journal = (journal + event).takeLast(MAX_JOURNAL_EVENTS),
    lastCheckinAt = if (event.type == "checkin") event.at else lastCheckinAt,
    updatedAt = event.at
)

fun Trip.markShared(id: String): Trip = copy(journal = journal.map { if (it.id == id) it.copy(shareOpened = true) else it })

fun Trip.lastEvent(type: String): JournalEvent? = journal.lastOrNull { it.type == type }

/** 이름 뒤 조사(이/가). 받침이 있으면 "이". 비어 있으면 "부모님이". */
fun subjectOf(name: String): String {
    val value = name.trim().ifEmpty { "부모님" }
    val last = value.last()
    val hasFinal = last in '가'..'힣' && (last - '가') % 28 != 0
    return value + if (hasFinal) "이" else "가"
}

/** "1. 장소 (현지 표기) — 근거 · 확신" 형식의 줄에서 장소 이름만 뽑는다(최대 3개). */
fun parsePlaceCandidates(text: String): List<String> {
    val pattern = Regex("""^\s*\d+[.)]\s*\**(.+?)\**\s*(?:\(|—|–|-|:|$)""")
    return text.lines().mapNotNull { pattern.find(it)?.groupValues?.get(1)?.trim()?.ifEmpty { null } }.take(3)
}

/** 입력한 현지 긴급번호가 전화로 걸 수 있는 모양인지(숫자 2–15자리, 앞의 + 허용). */
fun dialable(number: String): String? {
    val dial = number.trim().replace(Regex("""[\s().-]"""), "")
    return dial.takeIf { Regex("""\+?\d{2,15}""").matches(it) }
}
