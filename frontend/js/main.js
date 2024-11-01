
function isLoggedIn() {
    return !!localStorage.getItem('token');
}

function updateNavbar() {
    const authLinks = document.getElementById('auth-links');
    const userLinks = document.getElementById('user-links');
    
    if (isLoggedIn()) {
        authLinks.style.display = 'none';
        userLinks.style.display = 'block';
    } else {
        authLinks.style.display = 'block';
        userLinks.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('navbar-placeholder').innerHTML = data;
            updateNavbar();
        });

    document.addEventListener('click', event => {
        if (event.target && event.target.id === 'logout-link') {
            event.preventDefault();
            localStorage.removeItem('token');
            updateNavbar();
            window.location.href = 'index.html';
        }
    });
});