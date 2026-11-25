(() => {
    document.documentElement.classList.add('access-granted');

    window.OneViewAccessControl = {
        runWhenAuthorized(callback) {
            callback();
        }
    };
})();