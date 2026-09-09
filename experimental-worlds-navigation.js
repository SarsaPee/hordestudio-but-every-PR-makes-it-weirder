(() => {
    'use strict';
    const target = document.getElementById('nav-experimental-worlds-btn');
    if (!target) return;
    target.addEventListener('click', () => {
        const port = location.port ? `:${location.port}` : '';
        location.assign(`http://localhost${port}/`);
    });
})();
