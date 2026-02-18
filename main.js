const generateBtn = document.getElementById('generate-btn');
const lottoNumbersContainer = document.getElementById('lotto-numbers');
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

// 저녁 메뉴 추천 관련 요소
const recommendBtn = document.getElementById('recommend-btn');
const dinnerMenuText = document.getElementById('dinner-menu-text');

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
    { name: "돈까스", "keywords": "donkatsu,japanese food" },
    { name: "햄버거", "keywords": "hamburger,fast food" },
    { name: "치킨", "keywords": "chicken,fried chicken" },
    { name: "보쌈", "keywords": "bossam,korean food" },
    { name: "족발", "keywords": "jokbal,korean food" }
];

// 테마 적용 함수
function applyTheme(theme) {
    if (!themeToggle) return;
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        const icon = themeToggle.querySelector('.icon');
        if (icon) icon.textContent = '☀️'; 
    } else {
        body.classList.remove('dark-mode');
        const icon = themeToggle.querySelector('.icon');
        if (icon) icon.textContent = '🌙';
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
    if (!dinnerMenuText) return;
    const randomIndex = Math.floor(Math.random() * dinnerMenus.length);
    const selectedMenu = dinnerMenus[randomIndex];
    
    dinnerMenuText.textContent = selectedMenu.name;
    lastRecommendedMenu = selectedMenu.name;
}

// 테마 토글 버튼 이벤트 리스너
if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

// 페이지 로드 시 테마 적용
applySavedTheme();

// 로또 번호 생성 버튼 이벤트 리스너
if (generateBtn && lottoNumbersContainer) {
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
}

// 저녁 메뉴 추천 버튼 이벤트 리스너
if (recommendBtn) {
    recommendBtn.addEventListener('click', recommendDinnerMenu);
}

// "레시피 보기" 버튼 이벤트 리스너
const showRecipeBtn = document.getElementById('show-recipe-btn');
let lastRecommendedMenu = ''; // Variable to store the last recommended menu
if (showRecipeBtn) {
    showRecipeBtn.addEventListener('click', () => {
        if (lastRecommendedMenu) {
            window.open(`recipe.html?name=${encodeURIComponent(lastRecommendedMenu)}`, '_blank');
        } else {
            alert('먼저 메뉴 추천을 받아주세요!');
        }
    });
}

// 페이지 로드 시 첫 저녁 메뉴 추천
if (dinnerMenuText) {
    recommendDinnerMenu();
}

// Disqus 스크립트 로드
window.disqus_config = function () {
    this.page.url = window.location.href;
    if (window.location.pathname.includes('recipe.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const recipeName = urlParams.get('name');
        this.page.identifier = `/recipe/${recipeName || 'default-recipe'}`;
    } else {
        this.page.identifier = window.location.pathname;
    }
};

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('disqus_thread')) {
        (function() { 
            var d = document, s = d.createElement('script');
            s.src = 'https://surfer-1.disqus.com/embed.js';
            s.setAttribute('data-timestamp', +new Date());
            (d.head || d.body).appendChild(s);
        })();
    }
});


// Teachable Machine - Rock Paper Scissors Game Logic
const URL = "https://teachablemachine.withgoogle.com/models/pjLpqLiag/";
let model, webcam, maxPredictions;
let rpsGameRunning = false;
let playerScore = 0;
let computerScore = 0;
let playerLastChoice = "";
let computerLastChoice = "";
let countdownValue = 0; 

// DOM Elements for RPS Game
const webcamContainer = document.getElementById("webcam-container");
const labelContainer = document.getElementById("label-container");
const gameStatusDisplay = document.getElementById("game-status");
const playerChoiceDisplay = document.getElementById("player-choice");
const computerChoiceDisplay = document.getElementById("computer-choice");
const playerScoreDisplay = document.getElementById("player-score");
const computerScoreDisplay = document.getElementById("computer-score");
const playRoundBtn = document.getElementById("play-round-btn");
const rpsGameStartButton = document.querySelector(".rps-game-container button[onclick='initRPS()']");

let animationFrameId; 

async function initRPS() {
    if (rpsGameStartButton) rpsGameStartButton.style.display = 'none';

    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    const flip = true; 
    webcam = new tmImage.Webcam(200, 200, flip); 
    await webcam.setup(); 
    await webcam.play();
    
    if (webcamContainer) {
        webcamContainer.innerHTML = ''; 
        webcamContainer.appendChild(webcam.canvas);
    }

    if (labelContainer) {
        labelContainer.innerHTML = ''; 
        for (let i = 0; i < maxPredictions; i++) {
            labelContainer.appendChild(document.createElement("div"));
        }
    }

    resetGame();
    startCountdown(); 
    if (playRoundBtn) playRoundBtn.onclick = startNewRound; 
}

function startCountdown() {
    countdownValue = 3; 
    rpsGameRunning = false; 
    if (playRoundBtn) playRoundBtn.style.display = 'none'; 

    if (gameStatusDisplay) gameStatusDisplay.textContent = "준비!";
    if (playerChoiceDisplay) playerChoiceDisplay.textContent = "";
    if (computerChoiceDisplay) computerChoiceDisplay.textContent = "";

    const countdownInterval = setInterval(() => {
        if (countdownValue > 0) {
            if (gameStatusDisplay) gameStatusDisplay.textContent = `가위바위보! ${countdownValue}...`;
            countdownValue--;
        } else {
            clearInterval(countdownInterval);
            if (gameStatusDisplay) gameStatusDisplay.textContent = "시작!";
            rpsGameRunning = true; 
            if (!animationFrameId) {
                animationFrameId = window.requestAnimationFrame(loopRPS);
            }
        }
    }, 1000);
}


async function loopRPS() {
    if (webcam) { 
        webcam.update(); 
        if (rpsGameRunning) {
            await predictRPS();
        }
    }
    animationFrameId = window.requestAnimationFrame(loopRPS);
}

async function predictRPS() {
    const prediction = await model.predict(webcam.canvas);
    let highestPrediction = { className: "없음", probability: 0 };

    for (let i = 0; i < maxPredictions; i++) {
        if (labelContainer) {
            const classPrediction =
                prediction[i].className + ": " + prediction[i].probability.toFixed(2);
            labelContainer.childNodes[i].innerHTML = classPrediction;
        }

        if (prediction[i].probability > highestPrediction.probability) {
            highestPrediction = prediction[i];
        }
    }

    if (rpsGameRunning && highestPrediction.probability > 0.85) { 
        playerLastChoice = highestPrediction.className;
        if (playerChoiceDisplay) playerChoiceDisplay.textContent = playerLastChoice;
        
        rpsGameRunning = false; 
        playRound();
    } else if (rpsGameRunning) {
        if (playerChoiceDisplay) playerChoiceDisplay.textContent = "고르는 중...";
    }
}

function stopWebcam() {
    if (webcam) {
        webcam.stop();
        if (webcamContainer) webcamContainer.innerHTML = '';
        if (labelContainer) labelContainer.innerHTML = '';
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
}

function getComputerChoice() {
    const choices = ["바위", "보", "가위"]; 
    const randomIndex = Math.floor(Math.random() * choices.length);
    return choices[randomIndex];
}

function determineWinner(player, computer) {
    if (player === computer) {
        return "무승부";
    } else if (
        (player === "바위" && computer === "가위") ||
        (player === "보" && computer === "바위") ||
        (player === "가위" && computer === "보")
    ) {
        return "당신 승리!";
    } else {
        return "컴퓨터 승리!";
    }
}

function playRound() {
    computerLastChoice = getComputerChoice();
    if (computerChoiceDisplay) computerChoiceDisplay.textContent = computerLastChoice;

    const result = determineWinner(playerLastChoice, computerLastChoice);
    if (gameStatusDisplay) gameStatusDisplay.textContent = result;

    if (result === "당신 승리!") {
        playerScore++;
    } else if (result === "컴퓨터 승리!") {
        computerScore++;
    }
    updateScoreDisplay();
    if (playRoundBtn) playRoundBtn.style.display = 'block'; 
}

function updateScoreDisplay() {
    if (playerScoreDisplay) playerScoreDisplay.textContent = playerScore;
    if (computerScoreDisplay) computerScoreDisplay.textContent = computerScore;
}

function resetGame() {
    playerScore = 0;
    computerScore = 0;
    playerLastChoice = "";
    computerLastChoice = "";
    if (gameStatusDisplay) gameStatusDisplay.textContent = "게임을 시작하세요!";
    if (playerChoiceDisplay) playerChoiceDisplay.textContent = "";
    if (computerChoiceDisplay) computerChoiceDisplay.textContent = "";
    updateScoreDisplay();
    if (playRoundBtn) playRoundBtn.style.display = 'none'; 
}

function startNewRound() {
    if (playerChoiceDisplay) playerChoiceDisplay.textContent = "";
    if (computerChoiceDisplay) computerChoiceDisplay.textContent = "";
    if (playRoundBtn) playRoundBtn.style.display = 'none'; 
    startCountdown(); 
}

window.togglePostContent = function(button) {
    const postCard = button.closest('.blog-post-card');
    const fullContent = postCard.querySelector('.full-post-content');
    const ellipsis = postCard.querySelector('.ellipsis');

    if (fullContent.style.display === 'none' || fullContent.style.display === '') {
        fullContent.style.display = 'inline'; 
        if (ellipsis) ellipsis.style.display = 'none'; 
        button.textContent = '간략히 보기'; 
    } else {
        fullContent.style.display = 'none'; 
        if (ellipsis) ellipsis.style.display = 'inline'; 
        button.textContent = '더 읽어보기'; 
    }
};

window.initRPS = initRPS;