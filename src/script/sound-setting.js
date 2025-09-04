export class SoundSetting {
    constructor() {
        this.body = document.querySelector('body');
    }

    soundNavToggle() {
        const navSound = document.getElementById('sound-setting'),
            bg = document.getElementById('bg-sound-setting'),
            btnSoundSettings = document.querySelectorAll('[data-name="btn-sound-setting"]'),
            btnClose = document.getElementById('btn-close-sound-setting'),
            nameSound = document.getElementById('name-sound'),
            soundIndicator = document.getElementById('sound-indicator'),
            lowFilterControl = document.getElementById('lowFilterControl'),
            midFilterControl = document.getElementById('midFilterControl'),
            highFilterControl = document.getElementById('highFilterControl'),
            btnMenu = document.querySelector('[data-name="btn-menu"]'),
            btnCloseMenu = document.querySelector('[data-name="btn-close"]'),
            bgMenu = document.querySelector('[data-name="bg-menu"]'),
            menu = document.querySelector('[data-name="menu"]');


        // メニューを開く
        btnSoundSettings.forEach(btn => {
            this.clickManager(btn, navSound, true);
        });

        // メニューを閉じる
        this.clickManager(btnClose, navSound, false);
        this.clickManager(bg, navSound, false);

        this.clickManager(btnMenu, menu, true);
        this.clickManager(btnCloseMenu, menu, false);
        this.clickManager(bgMenu, menu, false);
    }

    clickManager(el, nav, isOpen = false) {
        el.addEventListener('click', () => {
            console.log(isOpen);
            console.log(nav);
            console.log(el);

            if (isOpen) {
                this.openNav(nav);
            } else {
                this.closeNav(nav);
            }
        });
    }



    openNav(nav) {
        nav.classList.remove('hidden');
        nav.classList.add('grid');
    }
    
    closeNav(nav) {
        nav.classList.remove('grid');
        nav.classList.add('hidden');
    }
}