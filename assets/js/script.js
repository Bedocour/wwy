const container = document.getElementById('canvas-container');

let imageSources = [];
let points = [];
let activeIndex = 0;
let TOTAL_POINTS = 0; // Фиксированное количество примитивов

let SCALE = (window.innerWidth / 1920) * 60; // Масштаб сердца
let SQUARE_SIZE = SCALE * 6.0;


// 1. Математическая проверка попадания точки внутрь сердца
// Формула: (x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0
function isInsideHeart(x, y) {
    // Нормализуем координаты для стандартного уравнения сердца
    const nx = x / 13; 
    const ny = -y / 13; // Инверсия Y для канваса
    return Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * Math.pow(ny, 3) <= 0;
}

// 2. Равномерное распределение точек внутри области
function generatePoints() {
    const foundPoints = [];
    const attemptsLimit = 5000;
    let attempts = 0;
    let currentMinDistance = 3.2;

    while (foundPoints.length < TOTAL_POINTS && attempts < attemptsLimit) {
        // 1. Генерируем случайный угол t от 0 до 2PI
        const t = Math.random() * Math.PI * 2;
        
        // 2. Генерируем случайный радиус r (от 0 до 1), 
        // чтобы заполнять внутренность, а не только контур
        const r = Math.sqrt(Math.random()); 

        // 3. НОВАЯ ВЫРАЖЕННАЯ ФОРМУЛА
        // x = 16 * sin^3(t)
        // y = 13 * cos(t) - 5 * cos(2t) - 2 * cos(3t) - cos(4t)
        let rx = 16 * Math.pow(Math.sin(t), 3);
        let ry = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));

        // Применяем радиус для заполнения внутренности
        rx *= r;
        ry *= r;

        // 4. Проверка на дистанцию (чтобы не слипались)
        const tooClose = foundPoints.some(p => {
            const dx = p.x - rx;
            const dy = p.y - ry;
            return Math.sqrt(dx*dx + dy*dy) < currentMinDistance; 
        });

        if (!tooClose) {
            foundPoints.push({ x: rx, y: ry });
        }

        attempts++;
        if (attempts % 150 === 0) currentMinDistance *= 0.97;
    }

    // Перемешиваем массив, чтобы квадратики появлялись в случайном порядке
    return foundPoints.sort(() => Math.random() - 0.5);
}

// Функция для предзагрузки одной картинки
function preloadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
    });
}

async function init() {
    const preloader = document.getElementById('preloader');

    try {
        const response = await fetch('./assets/imgs/memo_list.json');
        imageSources = await response.json();

        imageSources.sort(() => Math.random() - 0.5);

        TOTAL_POINTS = imageSources.length;

        if (TOTAL_POINTS === 0) {
            console.error("Список фотографий пуст!");
            preloader.classList.add('preloader-hidden'); // Скрываем, если ошибка
            return;
        }

        const imagePromises = imageSources.map(src => 
            preloadImage(`./assets/imgs/memories/${src}`)
        );

        await Promise.all(imagePromises);
    } catch (e) {
        console.error("Ошибка загрузки имен картинок", e);
        preloader.classList.add('preloader-hidden');
        return;
    }

    points = generatePoints();

    points.forEach((pos, index) => {

        const centerX = container.offsetWidth / 2;
        const centerY = container.offsetHeight / 2;
        
        // Создаем фоновую точку (подложку)
        const dot = document.createElement('div');
        dot.className = 'point';
        dot.style.left = `${centerX + pos.x * SCALE}px`;
        dot.style.top = `${centerY + pos.y * SCALE}px`;
        container.appendChild(dot);

        const wrapper = document.createElement('div');
        wrapper.className = 'wrapper';
        wrapper.id = `wrap-${index}`;

        // 2. Создаем элемент ТЕНИ (просто пустой div)
        const shadow = document.createElement('div');
        shadow.className = 'shadow';
        shadow.style.width = `${SQUARE_SIZE}px`;
        shadow.style.height = `${SQUARE_SIZE}px`;

        // Создаем скрытый фоточк
        const img = document.createElement('img');
        img.className = 'square';
        img.style.width = `${SQUARE_SIZE}px`;
        img.style.height = `${SQUARE_SIZE}px`;
        // Берем картинку по кругу, если точек больше, чем фото
        const imgSrc = imageSources[index % imageSources.length];
        img.src = `./assets/imgs/memories/${imgSrc}`;
        img.style.objectFit = 'cover'; // Чтобы фото не сплющивалось

        // Добавляем шум смещения и случайный поворот
        const noiseX = (Math.random() - 0.5) * 8;
        const noiseY = (Math.random() - 0.5) * 8;
        const randomRotation = (Math.random() - 0.5) * 15;

        wrapper.style.left = `${centerX + pos.x * SCALE + noiseX}px`;
        wrapper.style.top = `${centerY + pos.y * SCALE + noiseY}px`;

        // Начальное состояние для GSAP
        gsap.set(shadow, {opacity: 0.5});
        gsap.to(shadow, {x: 368, y: 258});
        gsap.set(img, {rotation: randomRotation});
        gsap.set(wrapper, { scale: 2, opacity: 0 });

        // Собираем "бутерброд"
        wrapper.appendChild(shadow); // Тень снизу
        wrapper.appendChild(img);     // Фото сверху
        container.appendChild(wrapper);
    });

    preloader.classList.add('preloader-hidden');
}

// 3. Обработка скролла
function handleScroll(event) {
    hideInstructions();
    if (event.deltaY > 0) {
        // Скролл вниз - добавляем квадратик
        if (activeIndex < TOTAL_POINTS) {
            showSquare(activeIndex);
            activeIndex++;

            // ПРОВЕРКА: Если это был последний кубик
            if (activeIndex === TOTAL_POINTS) {
                // Вызываем зум не мгновенно, а через небольшую паузу (например, 500мс)
                // Чтобы пользователь увидел финальный упавший кубик
                setTimeout(finalZoomOut, 500);
            }
        }
    } else {
        // Скролл вверх - убираем квадратик
        if (activeIndex > 0) {
            activeIndex--;
            hideSquare(activeIndex);
        }
    }
}

function hideInstructions() {
    // Если у тебя есть инструкции или подписи, их можно плавно скрыть
    gsap.to(".instructions", {
        opacity: 0,
        duration: 1
    });
}

function showSquare(index) {
    const wrapper = document.getElementById(`wrap-${index}`);
    const img = wrapper.querySelector('.square');
    const shadow = wrapper.querySelector('.shadow');

    const rotation = (Math.random() - 0.5) * 120;
    
    // Анимируем появление контейнера (позиция и масштаб)
    gsap.to(wrapper, {
        scale: 1,
        opacity: 1,
        duration: 0.6,
        ease: "power2.out"
    });


    // Анимируем вращение ТОЛЬКО картинки
    gsap.to(img, {
        rotation: rotation, // Картинка крутится
        duration: 0.6
    });

    gsap.to(shadow, {
        x: 2.2,
        y: 1.5,
        rotation: rotation,
        opacity: 0.5,
        filter: "blur(3px)",
        duration: 0.6
    });
}

function hideSquare(index) {
    const wrapper = document.getElementById(`wrap-${index}`);
    const img = wrapper.querySelector('.square');
    const shadow = wrapper.querySelector('.shadow');

    const rotation = (Math.random() - 0.5) * 120;

    gsap.to(wrapper, {
        scale: 2,
        opacity: 0,
        duration: 0.4,
        rotation: (Math.random() - 0.5) * 15,
        ease: "power1.out"
    });

    gsap.to(img, {
        rotation: rotation, // Картинка крутится
        duration: 0.6
    });

    gsap.to(shadow, {
        x: 368,
        y: 258,
        filter: "blur(50px)",
        rotation: rotation,
        duration: 0.6
    });
}

function finalZoomOut() {
    gsap.to("#canvas-container", {
        scale: 0.25,
        duration: 2,
        ease: "power2.inOut"
    });
}

window.addEventListener('wheel', handleScroll);
window.onload = init;