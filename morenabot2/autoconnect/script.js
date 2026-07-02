document.addEventListener('DOMContentLoaded', () => {
    // Управление выпадающим списком ОС
    const osDropdownBtn = document.getElementById('os-dropdown-btn');
    const osDropdownMenu = document.getElementById('os-dropdown-menu');
    const osDropdownText = document.getElementById('os-dropdown-text');
    const osDropdownIcon = document.getElementById('os-dropdown-icon');
    const osDropdownChevron = document.getElementById('os-dropdown-chevron');
    const downloadBtnText = document.getElementById('download-btn-text');
    const osButtons = document.querySelectorAll('.os-option');

    let isDropdownOpen = false;

    // SVG иконки для обновления при смене ОС
    const icons = {
        monitor: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-cyan-400 drop-shadow-[0_0_5px_#00f0ff]"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
        smartphone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-cyan-400 drop-shadow-[0_0_5px_#00f0ff]"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`
    };

    function toggleDropdown() {
        isDropdownOpen = !isDropdownOpen;
        if (isDropdownOpen) {
            osDropdownMenu.classList.remove('hidden');
            osDropdownChevron.classList.add('rotate-180');
        } else {
            osDropdownMenu.classList.add('hidden');
            osDropdownChevron.classList.remove('rotate-180');
        }
    }

    osDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвращаем закрытие при клике на саму кнопку
        toggleDropdown();
    });

    // Закрытие при клике вне меню
    document.addEventListener('click', (e) => {
        if (isDropdownOpen && !osDropdownBtn.contains(e.target) && !osDropdownMenu.contains(e.target)) {
            toggleDropdown();
        }
    });

    // Обработка выбора ОС
    osButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const osName = btn.dataset.os;
            const iconType = btn.dataset.icon;
            
            // Обновляем текст и иконку выбранной ОС
            osDropdownText.textContent = osName;
            osDropdownIcon.innerHTML = icons[iconType];
            
            // Обновляем текст на кнопке скачивания
            downloadBtnText.textContent = `Скачать ${osName}`;
            
            // Сбрасываем стили у всех кнопок в меню
            osButtons.forEach(b => {
                b.classList.remove('bg-cyan-500/20', 'text-cyan-400', 'border-l-2', 'border-cyan-400');
                b.classList.add('text-slate-400', 'border-transparent');
                
                // Делаем иконки тонкими у неактивных (если они есть внутри)
                const svg = b.querySelector('svg');
                if (svg) svg.setAttribute('stroke-width', '1.5');
            });

            // Установка активных стилей для выбранного элемента
            btn.classList.add('bg-cyan-500/20', 'text-cyan-400', 'border-l-2', 'border-cyan-400');
            btn.classList.remove('text-slate-400', 'border-transparent');
            
            // Делаем иконку жирной у активного
            const activeSvg = btn.querySelector('svg');
            if (activeSvg) activeSvg.setAttribute('stroke-width', '2');

            toggleDropdown();
        });
    });

    // Управление вкладками (Happ / INCY)
    const tabHapp = document.getElementById('tab-happ');
    const tabIncy = document.getElementById('tab-incy');

    function setActiveTab(tab) {
        if (tab === 'happ') {
            // Активируем Happ
            tabHapp.className = "text-lg font-bold tracking-widest uppercase transition-all duration-300 text-cyan-400 drop-shadow-[0_0_10px_#00f0ff] border-b-2 border-cyan-400 pb-2";
            // Деактивируем INCY
            tabIncy.className = "text-lg font-bold tracking-widest uppercase transition-all duration-300 text-slate-500 hover:text-slate-300 pb-2 border-b-2 border-transparent";
        } else {
            // Активируем INCY
            tabIncy.className = "text-lg font-bold tracking-widest uppercase transition-all duration-300 text-purple-400 drop-shadow-[0_0_10px_#a855f7] border-b-2 border-purple-400 pb-2";
            // Деактивируем Happ
            tabHapp.className = "text-lg font-bold tracking-widest uppercase transition-all duration-300 text-slate-500 hover:text-slate-300 pb-2 border-b-2 border-transparent";
        }
    }

    tabHapp.addEventListener('click', () => setActiveTab('happ'));
    tabIncy.addEventListener('click', () => setActiveTab('incy'));
});
