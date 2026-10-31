package com.ani9085.easytravel

import com.ani9085.easytravel.data.DateCheck
import com.ani9085.easytravel.data.ItemStatus
import com.ani9085.easytravel.data.ItineraryItem
import com.ani9085.easytravel.data.JournalEvent
import com.ani9085.easytravel.data.Timeline
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.TripProfile
import com.ani9085.easytravel.data.checkDates
import com.ani9085.easytravel.data.dialable
import com.ani9085.easytravel.data.nextItem
import com.ani9085.easytravel.data.parsePlaceCandidates
import com.ani9085.easytravel.data.subjectOf
import com.ani9085.easytravel.data.timeline
import com.ani9085.easytravel.data.withEvent
import com.ani9085.easytravel.data.withStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class TripLogicTest {
    private val dates = TripProfile(destination = "도쿄", startDate = "2026-11-06", endDate = "2026-11-10")

    @Test fun `귀국일이 출발일보다 빠르면 1일로 덮어쓰지 않고 오류 (T02)`() {
        assertTrue(checkDates(dates.copy(endDate = "2026-11-01")) is DateCheck.Error)
        assertEquals(DateCheck.Ok(5, false), checkDates(dates))
        assertEquals(DateCheck.Ok(3, true), checkDates(TripProfile()))
        assertTrue(checkDates(dates.copy(endDate = "")) is DateCheck.Error)
        assertTrue(checkDates(dates.copy(startDate = "2026-02-30")) is DateCheck.Error)
        assertTrue(checkDates(dates.copy(endDate = "2026-12-31")) is DateCheck.Error)
    }

    @Test fun `오늘은 목적지 시간대 기준 (T18)`() {
        // 한국 11/06 01:30 = 파리 11/05 17:30 = 도쿄 11/06 01:30
        val now = Instant.parse("2026-11-05T16:30:00Z")
        assertEquals(Timeline.Before(1), timeline(dates, now, ZoneId.of("Europe/Paris")))
        assertEquals(Timeline.During(1, 5), timeline(dates, now, ZoneId.of("Asia/Tokyo")))
        assertEquals(Timeline.After, timeline(dates, Instant.parse("2026-11-11T12:00:00Z"), ZoneId.of("Asia/Tokyo")))
        assertEquals(Timeline.Undated, timeline(TripProfile(), now, ZoneId.of("Asia/Tokyo")))
    }

    @Test fun `여행 중이면 오늘 Day의 끝나지 않은 장소가 다음 일정`() {
        val items = listOf(ItineraryItem("1", 1, "신주쿠 교엔"), ItineraryItem("2", 2, "센소지"), ItineraryItem("3", 3, "도쿄역"))
        assertEquals("센소지", nextItem(items, Timeline.During(2, 5))?.name)
        assertEquals("신주쿠 교엔", nextItem(items, Timeline.Before(3))?.name)
        val done = items.map { if (it.day == 2) it.copy(status = ItemStatus.COMPLETED) else it }
        assertEquals("도쿄역", nextItem(done, Timeline.During(2, 5))?.name)
    }

    @Test fun `상태는 누른 장소만 바꾸고 기록 시각을 남긴다`() {
        val trip = Trip(itinerary = listOf(ItineraryItem("1", 1, "A"), ItineraryItem("2", 1, "B")))
        val next = trip.withStatus("2", ItemStatus.ARRIVED, "2026-11-06T01:00:00Z")
        assertEquals(ItemStatus.ARRIVED, next.itinerary[1].status)
        assertEquals("2026-11-06T01:00:00Z", next.itinerary[1].statusAt)
        assertEquals(ItemStatus.PLANNED, next.itinerary[0].status)
    }

    @Test fun `숙소 도착은 안부 시각을 바꾸지 않는다`() {
        var trip = Trip().withEvent(JournalEvent("e1", "hotel_arrival", "2026-11-06T12:00:00Z"))
        assertNull(trip.lastCheckinAt)
        trip = trip.withEvent(JournalEvent("e2", "checkin", "2026-11-06T13:00:00Z"))
        assertEquals("2026-11-06T13:00:00Z", trip.lastCheckinAt)
    }

    @Test fun `알림 문구 조사`() {
        assertEquals("엄마가", subjectOf("엄마"))
        assertEquals("아버님이", subjectOf("아버님"))
        assertEquals("부모님이", subjectOf(" "))
    }

    @Test fun `사진 결과에서 장소 후보를 뽑는다`() {
        val text = "1. 센소지 (浅草寺) — 간판 글자 · 확신 높음\n2. **카미나리몬** — 문 · 보통\n설명 줄"
        assertEquals(listOf("센소지", "카미나리몬"), parsePlaceCandidates(text))
    }

    @Test fun `전화로 걸 수 있는 번호만 통과`() {
        assertEquals("110", dialable(" 110 "))
        assertEquals("+33123456789", dialable("+33 1 23 45 67 89"))
        assertNull(dialable("경찰"))
        assertNull(dialable("1"))
    }
}
