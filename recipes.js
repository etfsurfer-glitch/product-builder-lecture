const recipes = {
    "김치찌개": {
        ingredients: [
            "돼지고기 목살 200g",
            "묵은지 1/4포기 (약 400g)",
            "두부 1/2모",
            "대파 1/2대",
            "청양고추 1개 (선택)",
            "양파 1/4개",
            "쌀뜨물 또는 다시마 육수 600ml",
            "식용유 약간"
        ],
        instructions: [
            "돼지고기는 한입 크기로 썰고, 김치는 속을 털어내고 먹기 좋게 썬다.",
            "두부는 도톰하게 썰고, 대파와 양파, 청양고추는 어슷 썬다.",
            "냄비에 식용유를 두르고 돼지고기를 볶다가 김치를 넣어 함께 볶는다.",
            "김치가 투명해지면 쌀뜨물 또는 육수와 양념 재료를 넣고 끓인다.",
            "국물이 끓으면 두부, 양파, 대파, 청양고추를 넣고 한소끔 더 끓여 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Kimchi_jjigae.jpg/1280px-Kimchi_jjigae.jpg"
    },
    "된장찌개": {
        ingredients: [
            "애호박 1/3개",
            "양파 1/4개",
            "두부 1/2모",
            "팽이버섯 1/2봉",
            "대파 1/2대",
            "멸치 다시마 육수 4컵",
            "된장 2큰술",
            "고추장 1/2큰술 (선택)",
            "다진 마늘 1/2큰술",
            "고춧가루 1/2큰술 (선택)"
        ],
        instructions: [
            "애호박, 양파, 두부는 먹기 좋게 썰고, 팽이버섯은 밑동을 제거한다. 대파는 어슷 썬다.",
            "냄비에 멸치 다시마 육수를 붓고 된장을 풀어 끓인다.",
            "육수가 끓으면 애호박, 양파를 넣고 끓인다.",
            "야채가 익으면 두부, 팽이버섯, 대파, 다진 마늘, 고추장, 고춧가루를 넣고 한소끔 더 끓인다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Doenjang-jjigae.jpg/1280px-Doenjang-jjigae.jpg"
    },
    "삼겹살": {
        ingredients: [
            "삼겹살 600g",
            "상추, 깻잎 등 쌈 채소",
            "쌈장, 마늘, 고추, 김치 (곁들임)"
        ],
        instructions: [
            "삼겹살은 적당한 두께로 썰어 준비한다.",
            "달군 팬에 삼겹살을 올리고 앞뒤로 노릇하게 굽는다.",
            "기름이 많이 나오면 키친타월로 닦아내면서 굽는다.",
            "먹기 좋게 자른 후 쌈 채소, 쌈장, 마늘 등과 함께 곁들여 먹는다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Samgyeopsal.jpg/1280px-Samgyeopsal.jpg"
    },
    "불고기": {
        ingredients: [
            "소고기 (불고기용) 600g",
            "양파 1/2개",
            "대파 1대",
            "팽이버섯 1봉",
            "불고기 양념 (간장 5큰술, 설탕 2큰술, 다진 마늘 1큰술, 참기름 1큰술, 깨소금 1큰술, 후추 약간, 배즙 또는 사과즙 2큰술)"
        ],
        instructions: [
            "소고기는 키친타월로 핏물을 제거한다.",
            "양파는 채 썰고, 대파는 어슷 썰고, 팽이버섯은 밑동을 제거한다.",
            "볼에 소고기와 불고기 양념 재료를 모두 넣고 잘 버무려 30분 이상 재운다.",
            "달군 팬에 양념된 소고기와 양파를 넣고 볶다가 고기가 거의 익으면 대파, 팽이버섯을 넣고 더 볶아 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Korean.food-Bulgogi-01.jpg/1280px-Korean.food-Bulgogi-01.jpg"
    },
    "비빔밥": {
        ingredients: [
            "밥 2공기",
            "소고기 100g (다진 것 또는 채 썬 것)",
            "각종 나물 (시금치, 콩나물, 고사리 등) 약간씩",
            "애호박 1/4개",
            "당근 1/4개",
            "계란 2개",
            "고추장, 참기름, 깨소금 (양념)"
        ],
        instructions: [
            "각종 나물은 데치거나 볶아서 준비하고, 애호박과 당근은 채 썰어 볶는다.",
            "소고기는 양념하여 볶는다. 계란은 지단을 부치거나 프라이를 만든다.",
            "그릇에 밥을 담고 준비된 나물, 소고기, 계란을 예쁘게 올린다.",
            "고추장, 참기름, 깨소금을 넣고 잘 비벼 먹는다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Bibimbap-01.jpg/1280px-Bibimbap-01.jpg"
    },
    "갈비찜": {
        ingredients: [
            "소갈비 1kg",
            "무 300g",
            "당근 100g",
            "표고버섯 3개",
            "대추 5개",
            "밤 5개",
            "은행 10알",
            "양념 (간장 10큰술, 설탕 3큰술, 다진 마늘 2큰술, 다진 생강 1/2큰술, 참기름 2큰술, 후추 약간, 배즙 5큰술, 물 2컵)"
        ],
        instructions: [
            "소갈비는 찬물에 담가 핏물을 제거하고, 끓는 물에 살짝 데쳐 불순물을 제거한다.",
            "무, 당근은 큼직하게 썰고, 표고버섯은 칼집을 낸다. 밤과 은행은 껍질을 벗긴다.",
            "냄비에 갈비와 양념 재료, 물을 넣고 센 불에서 끓이다가 중약불로 줄여 1시간 정도 푹 익힌다.",
            "무, 당근, 표고버섯, 대추, 밤, 은행을 넣고 야채가 익을 때까지 더 끓여 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Galbijjim.jpg/1280px-Galbijjim.jpg"
    },
    "닭갈비": {
        ingredients: [
            "닭다리살 600g",
            "양배추 1/4통",
            "고구마 1개",
            "양파 1/2개",
            "대파 1대",
            "깻잎 10장",
            "양념 (고추장 4큰술, 고춧가루 2큰술, 간장 2큰술, 설탕 1.5큰술, 다진 마늘 1.5큰술, 다진 생강 1/2큰술, 맛술 2큰술, 참기름 1큰술, 후추 약간)"
        ],
        instructions: [
            "닭다리살은 한입 크기로 썰고, 고구마와 양파, 양배추는 큼직하게 썬다. 대파는 어슷 썰고 깻잎은 채 썬다.",
            "볼에 닭다리살과 양념 재료를 모두 넣고 잘 버무려 30분 이상 재운다.",
            "달군 팬에 양념된 닭갈비와 고구마, 양파, 양배추를 넣고 볶다가 닭고기가 익으면 대파를 넣고 더 볶는다.",
            "마지막에 깻잎을 넣고 살짝 볶아 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Dak_galbi.jpg/1280px-Dak_galbi.jpg"
    },
    "제육볶음": {
        ingredients: [
            "돼지고기 목살 또는 앞다리살 600g",
            "양파 1/2개",
            "대파 1대",
            "청양고추 1개 (선택)",
            "양념 (고추장 3큰술, 고춧가루 2큰술, 간장 2큰술, 설탕 1큰술, 다진 마늘 1큰술, 다진 생강 1/2큰술, 맛술 1큰술, 참기름 1큰술, 후추 약간)"
        ],
        instructions: [
            "돼지고기는 먹기 좋게 썰고, 양파는 채 썰고, 대파와 청양고추는 어슷 썬다.",
            "볼에 돼지고기와 양념 재료를 모두 넣고 잘 버무려 30분 이상 재운다.",
            "달군 팬에 양념된 돼지고기를 넣고 볶다가 고기가 거의 익으면 양파, 대파, 청양고추를 넣고 더 볶아 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Jeyuk-bokkeum.jpg/1280px-Jeyuk-bokkeum.jpg"
    },
    "순두부찌개": {
        ingredients: [
            "순두부 1봉",
            "바지락 100g",
            "돼지고기 또는 소고기 (다진 것) 50g",
            "양파 1/4개",
            "대파 1/2대",
            "계란 1개",
            "물 또는 멸치 다시마 육수 300ml",
            "고추기름 1큰술",
            "다진 마늘 1큰술",
            "고춧가루 1큰술",
            "국간장 1큰술",
            "새우젓 1/2큰술 (선택)",
            "소금, 후추 약간"
        ],
        instructions: [
            "양파는 채 썰고, 대파는 어슷 썬다. 바지락은 해감한다.",
            "냄비에 고추기름을 두르고 다진 고기와 양파를 볶는다.",
            "고기가 익으면 고춧가루, 다진 마늘을 넣고 볶다가 물 또는 육수를 붓는다.",
            "국물이 끓으면 순두부와 바지락, 국간장을 넣고 끓인다.",
            "바지락이 입을 벌리면 대파를 넣고 한소끔 더 끓인 후 계란을 깨뜨려 넣고 소금, 후추로 간을 맞춰 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Sundubu-jjigae.jpg/1280px-Sundubu-jjigae.jpg"
    },
    "초밥": {
        ingredients: [
            "초밥용 밥 (고슬하게 지은 밥에 배합초 섞은 것)",
            "초밥용 생선회 (연어, 참치, 광어 등)",
            "고추냉이 (와사비)",
            "간장"
        ],
        instructions: [
            "초밥용 밥은 한입 크기로 뭉친다.",
            "생선회에 고추냉이를 약간 바르고 밥 위에 올린다.",
            "간장에 찍어 먹는다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Salmon_sushi.jpg/1280px-Salmon_sushi.jpg"
    },
    "파스타": {
        ingredients: [
            "파스타 면 200g",
            "올리브 오일 2큰술",
            "마늘 3쪽",
            "양파 1/4개",
            "베이컨 또는 새우 100g",
            "토마토 소스 또는 크림 소스 200ml",
            "소금, 후추, 파슬리 가루 약간"
        ],
        instructions: [
            "끓는 소금물에 파스타 면을 넣고 봉투에 적힌 시간만큼 삶는다.",
            "마늘은 편 썰고, 양파는 채 썰고, 베이컨 또는 새우는 먹기 좋게 준비한다.",
            "달군 팬에 올리브 오일을 두르고 마늘을 볶다가 양파, 베이컨 또는 새우를 넣고 볶는다.",
            "토마토 소스 또는 크림 소스를 넣고 끓이다가 삶은 파스타 면을 넣고 잘 섞는다.",
            "소금, 후추로 간을 맞추고 파슬리 가루를 뿌려 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Pasta_fresca_al_ragu%27.jpg/1280px-Pasta_fresca_al_ragu%27.jpg"
    },
    "피자": {
        ingredients: [
            "또띠아 또는 피자 도우",
            "피자 소스",
            "모짜렐라 치즈",
            "각종 토핑 (페퍼로니, 양파, 피망, 버섯 등)"
        ],
        instructions: [
            "또띠아 또는 피자 도우에 피자 소스를 바른다.",
            "모짜렐라 치즈와 각종 토핑을 올린다.",
            "200도로 예열된 오븐에 10~15분간 굽거나, 프라이팬에 뚜껑을 덮고 치즈가 녹을 때까지 굽는다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Eq_livm_301-1_pizza-3.jpg/1280px-Eq_livm_301-1_pizza-3.jpg"
    },
    "스테이크": {
        ingredients: [
            "소고기 스테이크용 (등심, 안심 등) 200g",
            "올리브 오일",
            "소금, 후추",
            "버터 1큰술",
            "로즈마리 (선택)"
        ],
        instructions: [
            "스테이크용 고기는 키친타월로 핏물을 제거하고, 소금과 후추를 뿌려 밑간한다.",
            "달군 팬에 올리브 오일을 두르고 고기를 올린다.",
            "앞뒤로 노릇하게 굽다가 버터와 로즈마리를 넣고 끼얹어가며 익힌다.",
            "원하는 굽기로 익으면 접시에 담아 잠시 레스팅한 후 썬다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Rib_eye_steak_medium.jpg/1280px-Rib_eye_steak_medium.jpg"
    },
    "카레": {
        ingredients: [
            "카레 가루 100g",
            "돼지고기 또는 닭고기 200g",
            "감자 1개",
            "양파 1/2개",
            "당근 1/2개",
            "물 600ml",
            "식용유 약간"
        ],
        instructions: [
            "돼지고기 또는 닭고기는 한입 크기로 썰고, 감자, 양파, 당근도 한입 크기로 썬다.",
            "달군 냄비에 식용유를 두르고 고기를 볶다가 감자, 양파, 당근을 넣고 함께 볶는다.",
            "야채가 살짝 익으면 물을 붓고 끓인다.",
            "국물이 끓으면 카레 가루를 넣고 잘 풀어 저어가며 걸쭉해질 때까지 끓인다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Japanese_curry_rice.jpg/1280px-Japanese_curry_rice.jpg"
    },
    "돈까스": {
        ingredients: [
            "돼지고기 등심 2장",
            "밀가루, 계란, 빵가루",
            "식용유 (튀김용)",
            "돈까스 소스 (시판용 또는 직접 만든 것)"
        ],
        instructions: [
            "돼지고기 등심은 칼등으로 두드려 부드럽게 만든 후 소금, 후추로 밑간한다.",
            "밀가루, 계란물, 빵가루 순으로 튀김옷을 입힌다.",
            "170도로 예열된 기름에 돈까스를 넣고 노릇하게 튀겨낸다.",
            "튀겨낸 돈까스는 기름을 빼고 돈까스 소스를 뿌려 밥과 함께 낸다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Tonkatsu.jpg/1280px-Tonkatsu.jpg"
    },
    "햄버거": {
        ingredients: [
            "햄버거 빵 1개",
            "소고기 패티 1장",
            "양상추, 토마토, 양파 슬라이스",
            "치즈 슬라이스 1장 (선택)",
            "케첩, 마요네즈, 머스타드 (소스)"
        ],
        instructions: [
            "햄버거 빵은 팬에 살짝 굽는다.",
            "소고기 패티는 팬에 굽거나 에어프라이어에 익힌다. 치즈 슬라이스를 올리고 녹인다.",
            "구운 빵 위에 양상추, 토마토, 양파, 패티, 치즈를 올리고 소스를 뿌려 완성한다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Hamburger_%28black_bg%29.jpg/1280px-Hamburger_%28black_bg%29.jpg"
    },
    "치킨": {
        ingredients: [
            "닭 1마리 (튀김용 손질된 것)",
            "튀김가루 또는 치킨 파우더",
            "식용유 (튀김용)",
            "양념치킨 소스 (선택)"
        ],
        instructions: [
            "손질된 닭에 튀김가루 또는 치킨 파우더를 골고루 입힌다.",
            "170도로 예열된 기름에 닭을 넣고 노릇하게 튀겨낸다.",
            "튀겨낸 치킨은 기름을 빼고 양념치킨 소스에 버무리거나 그대로 낸다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Korean_fried_chicken.jpg/1280px-Korean_fried_chicken.jpg"
    },
    "보쌈": {
        ingredients: [
            "돼지고기 삼겹살 또는 목살 1kg",
            "된장 2큰술",
            "커피 가루 1큰술 (돼지고기 잡내 제거용)",
            "대파 1대",
            "양파 1/2개",
            "마늘 5쪽",
            "생강 1쪽",
            "통후추 약간",
            "물 (고기가 잠길 정도)"
        ],
        instructions: [
            "돼지고기는 통째로 준비한다.",
            "냄비에 돼지고기와 된장, 커피 가루, 대파, 양파, 마늘, 생강, 통후추를 넣고 고기가 잠길 정도로 물을 붓는다.",
            "센 불에서 끓이다가 중약불로 줄여 1시간 30분~2시간 정도 푹 삶는다.",
            "삶은 고기는 꺼내 한 김 식힌 후 먹기 좋게 썰어 보쌈김치, 쌈 채소 등과 함께 낸다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Bossam-01.jpg/1280px-Bossam-01.jpg"
    },
    "족발": {
        ingredients: [
            "돼지 족발 (앞다리) 1개",
            "간장 1컵",
            "설탕 1/2컵",
            "물엿 1/4컵",
            "물 5컵",
            "대파 1대",
            "양파 1개",
            "마늘 10쪽",
            "생강 1쪽",
            "통후추 1큰술",
            "팔각 2개 (선택)"
        ],
        instructions: [
            "돼지 족발은 찬물에 담가 핏물을 제거하고, 털을 깨끗하게 제거한다.",
            "끓는 물에 족발을 넣고 살짝 데쳐 불순물을 제거한다.",
            "큰 냄비에 데친 족발과 간장, 설탕, 물엿, 물, 대파, 양파, 마늘, 생강, 통후추, 팔각을 넣고 센 불에서 끓인다.",
            "국물이 끓으면 중약불로 줄여 2~3시간 정도 푹 삶는다. 중간에 족발을 뒤집어 가며 고루 양념이 배도록 한다.",
            "삶은 족발은 꺼내 한 김 식힌 후 먹기 좋게 썰어 새우젓, 쌈 채소 등과 함께 낸다."
        ],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Jokbal.jpg/1280px-Jokbal.jpg"
    }
};

// Export the recipes object so it can be imported in recipe.html
// This will be added to recipe.html via a script tag
// For direct use in recipe.html, we can make it a global variable
// However, the best practice would be to use ES Modules or similar.
// For simplicity within the current context, I'll define it as a global object.
// window.recipes = recipes; // No need for this if directly put in a script tag in HTML

// This script will be included directly in recipe.html
// So no explicit export is needed if it's placed there.
