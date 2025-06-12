document.addEventListener('DOMContentLoaded', function () {
    const menuToggle = document.getElementById("menuToggle");
    const dropdownMenu = document.getElementById("dropdownMenu");

    menuToggle.addEventListener("click", function () {
        dropdownMenu.classList.toggle("active");
    });

    // Zamknięcie menu, jeśli klikniesz poza nim
    document.addEventListener("click", function (event) {
        if (!menuToggle.contains(event.target) && !dropdownMenu.contains(event.target)) {
            dropdownMenu.classList.remove("active");
        }
    });

    // Przeniesienie na stronę główną
    document.getElementById("homeButton").addEventListener("click", function () {
        window.location.href = "/";
    });

    // Wyświetlenie okna kontaktowego
    document.getElementById("contactButton").addEventListener("click", function () {
        alert("Kontakt do developera:\n📧 Email: [support contact]\n");
    });

})