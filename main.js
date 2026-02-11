const generateBtn = document.getElementById('generate-btn');
const lottoNumbersContainer = document.getElementById('lotto-numbers');
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

// 저녁 메뉴 추천 관련 요소
const recommendBtn = document.getElementById('recommend-btn');
const dinnerMenus = [
    { name: "김치찌개", keywords: "kimchi jjigae,korean food" },
    { name: "된장찌개", keywords: "doenjang jjigae,korean food" },
    { name: "삼겹살", keywords: "samgyeopsal,korean bbq" },
    { name: "불고기", keywords: "bulgogi,korean food" },
    { name: "비빔밥", keywords: "bibimbap,korean food" },
    { name: "갈비찜", keywords: "galbijjim,korean food" },
    { name: "닭갈비", keywords: "dakgalbi,korean food" },
    { name: "제육볶음", keywords: "jeyuk bokkeum,korean food" },
    { name: "순두부찌개", keywords: "sundubu jjigae,korean food" },
    { name: "초밥", keywords: "sushi,japanese food" },
    { name: "파스타", keywords: "pasta,italian food" },
    { name: "피자", keywords: "pizza,italian food" },
    { name: "스테이크", keywords: "steak,western food" },
    { name: "카레", keywords: "curry,indian food" },
    { name: "돈까스", keywords: "donkatsu,japanese food" },
    { name: "햄버거", keywords: "hamburger,fast food" },
    { name: "치킨", keywords: "chicken,fried chicken" },
    { name: "보쌈", keywords: "bossam,korean food" },
    { name: "족발", keywords: "jokbal,korean food" }
];

// 테마 적용 함수
function applyTheme(theme) {
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        themeToggle.querySelector('.icon').textContent = '☀️'; // 라이트 모드용 해 아이콘
    } else {
        body.classList.remove('dark-mode');
        themeToggle.querySelector('.icon').textContent = '🌙'; // 다크 모드용 달 아이콘
    }
}

// 테마 토글 함수
function toggleTheme() {
    const currentTheme = body.classList.contains('dark-mode') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
}

// 저장된 테마 적용 또는 시스템 기본 설정 사용
function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }
}

// 저녁 메뉴 추천 함수
function recommendDinnerMenu() {
    const randomIndex = Math.floor(Math.random() * dinnerMenus.length);
    const selectedMenu = dinnerMenus[randomIndex];
    
    document.getElementById('dinner-menu-text').textContent = selectedMenu.name;
}

// 테마 토글 버튼 이벤트 리스너
themeToggle.addEventListener('click', toggleTheme);

// 페이지 로드 시 테마 적용
applySavedTheme();

// 로또 번호 생성 버튼 이벤트 리스너
generateBtn.addEventListener('click', () => {
    lottoNumbersContainer.innerHTML = '';
    const numbers = new Set();
    while (numbers.size < 6) {
        const randomNumber = Math.floor(Math.random() * 45) + 1;
        numbers.add(randomNumber);
    }

    const sortedNumbers = Array.from(numbers).sort((a, b) => a - b);

    sortedNumbers.forEach(number => {
        const numberElement = document.createElement('div');
        numberElement.classList.add('lotto-number');
        numberElement.textContent = number;
        lottoNumbersContainer.appendChild(numberElement);
    });
});

// 저녁 메뉴 추천 버튼 이벤트 리스너
recommendBtn.addEventListener('click', recommendDinnerMenu);

// 페이지 로드 시 첫 저녁 메뉴 추천
recommendDinnerMenu();


