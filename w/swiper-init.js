window.addEventListener('load', function() {
    if ($(window).width() >= 480) {
        $('.tilt').tilt({ glare: true, maxGlare: .1, transition: true });
    }

    var swiperH = new Swiper('.swiper-container-h', {
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
        speed: 1000,
        autoplay: {
            delay: 8000,
            disableOnInteraction: true,
        },
        initialSlide: 0,
        spaceBetween: 25,
        effect: 'coverflow',
        grabCursor: true,
        centeredSlides: true,
        slidesPerView: 'auto',
        keyboard: { enabled: true },
        coverflowEffect: {
            rotate: 75,
            stretch: 0,
            depth: 100,
            modifier: 1,
            slideShadows: true,
        },
        pagination: {
            el: '.swiper-pagination-h',
            clickable: true,
        },
    });

    var swiperV = new Swiper('.swiper-container-v', {
        direction: 'vertical',
        speed: 2000,
        spaceBetween: 50,
        effect: 'coverflow',
        grabCursor: true,
        freeMode: true,
        freeModeSticky: true,
        mousewheel: true,
        keyboard: { enabled: true },
        centeredSlides: true,
        preloadImages: false,
        lazy: true,
        loadPrevNextAmount: 5,
        autoplay: {
            delay: 10000,
            disableOnInteraction: true,
        },
        coverflowEffect: {
            rotate: 90,
            stretch: 0,
            depth: 100,
            modifier: 1,
            slideShadows: true,
        },
        pagination: {
            el: '.swiper-pagination-v',
            clickable: true,
        },
    });

    var swiperVEl = document.querySelector('.swiper-container-v');
    swiperVEl.addEventListener('touchstart', function() {
        swiperH.allowTouchMove = false;
    }, { passive: true });
    swiperVEl.addEventListener('touchend', function() {
        swiperH.allowTouchMove = true;
    }, { passive: true });
    swiperVEl.addEventListener('touchcancel', function() {
        swiperH.allowTouchMove = true;
    }, { passive: true });

    $('.popup-youtube, .popup-vimeo, .popup-gmaps').magnificPopup({
        type: 'iframe',
        mainClass: 'mfp-fade',
        removalDelay: 160,
        preloader: false,
        fixedContentPos: false
    });

    $('.iframe-link').magnificPopup({
        type: 'iframe',
        iframe: {
            markup: '<div class="mfp-iframe-scaler iframo">'+
                    '<div class="mfp-close"></div>'+
                    '<iframe class="mfp-iframe" frameborder="0" allowfullscreen>            </iframe>'+
                    '</div>'
        },
        mainClass: 'mfp-fade'
    });
});
