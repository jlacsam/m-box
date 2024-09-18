function login() {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const csrfToken = getCookie('csrftoken');

    fetch("/login/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken  // Include CSRF token
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message == "success") {
            document.getElementById("message").textContent = "Login successful!";
            window.location.href = "/app/videos/";
        } else {
            document.getElementById("message").textContent = "Login failed.";
        }
    })
    .catch(error => {
        alert(error);
    });
}

