(() => {
    document.documentElement.classList.add('access-granted');

    window.NetSecAccessControl = {
        runWhenAuthorized(callback) {
            callback();
        }
    };
})();