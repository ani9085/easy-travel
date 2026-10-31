package com.ani9085.easytravel.data

// 웹(lib/trip.ts)의 Trip과 같은 뜻의 부모님 앱용 모델. 앱은 이 휴대폰 안에 저장하고, 서버에는 AI·항공 조회만 묻는다.

enum class ItemStatus(val wire: String, val label: String) {
    PLANNED("planned", "예정"),
    IN_PROGRESS("in_progress", "가는 중"),
    ARRIVED("arrived", "도착"),
    COMPLETED("completed", "다 봤어요"),
    SKIPPED("skipped", "건너뜀"),
    DELAYED("delayed", "늦어짐");

    val isOpen: Boolean get() = this != COMPLETED && this != SKIPPED

    companion object {
        fun from(value: String?): ItemStatus = entries.firstOrNull { it.wire == value } ?: PLANNED
    }
}

data class TripProfile(
    val destination: String = "",
    val departure: String = "",
    val originIata: String = "",
    val destinationIata: String = "",
    /** YYYY-MM-DD, 목적지 현지 날짜 */
    val startDate: String = "",
    val endDate: String = "",
    val travelers: Int = 1,
    val hotel: String = "",
    val emergencyNumber: String = "",
    /** 알림 문구에 쓸 호칭(예: 엄마). 비우면 "부모님" */
    val travelerName: String = ""
)

data class ItineraryItem(
    val id: String,
    val day: Int,
    val name: String,
    val note: String = "",
    val status: ItemStatus = ItemStatus.PLANNED,
    /** 부모님이 상태를 직접 누른 시각 */
    val statusAt: String? = null,
    val source: String = "user"
)

data class GeoPoint(val lat: Double, val lng: Double, val accuracy: Int)

/** 여행 중 직접 남긴 기록. 위치는 사용자가 고른 경우에만 들어간다. */
data class JournalEvent(
    val id: String,
    /** checkin · hotel_arrival · help */
    val type: String,
    val at: String,
    val location: GeoPoint? = null,
    /** 가족에게 알리기 화면을 열었는지. 실제로 보냈는지는 앱이 알 수 없다. */
    val shareOpened: Boolean = false
)

/** 항공 가격 감시. 서버의 /api/flights/search(Duffel)로 하루 두 번 정도 확인한다. */
data class PriceWatch(
    val enabled: Boolean = false,
    /** 인원 전체 왕복 목표 금액(원) */
    val targetPrice: Long? = null,
    val lastCheckedAt: String? = null,
    val lastBestPrice: Double? = null,
    val lastCurrency: String? = null,
    /** 마지막 확인 결과를 사람이 읽을 문장으로 */
    val lastStatus: String? = null
)

data class Trip(
    val profile: TripProfile = TripProfile(),
    val itinerary: List<ItineraryItem> = emptyList(),
    val journal: List<JournalEvent> = emptyList(),
    val lastCheckinAt: String? = null,
    val priceWatch: PriceWatch = PriceWatch(),
    /** 보호자 웹에서 가져온 시각. 직접 만들었으면 null */
    val importedAt: String? = null,
    val updatedAt: String = ""
) {
    val isEmpty: Boolean get() = profile.destination.isBlank() && itinerary.isEmpty()
}
