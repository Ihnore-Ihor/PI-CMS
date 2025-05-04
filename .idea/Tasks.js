document.getElementById("menuBtn").addEventListener("click", () => {
    const menu = document.getElementById("navbarBurger");
    if (menu.style.display === "block") {
        menu.style.display = "none";
    } else {
        menu.style.display = "block";
    }
})