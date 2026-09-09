(() => {
    'use strict';
    const target = document.getElementById('nav-stock-worlds-btn');
    if (!target) return;
    target.addEventListener('click', () => {
        const port = location.port ? `:${location.port}` : '';
        location.assign(`http://127.0.0.1${port}/`);
    });
})();
