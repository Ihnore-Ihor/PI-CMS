const table = document.getElementById("tableStudents");
const paginationContainer = document.getElementById("pagination");

let studentsList = [];
let page = 1;
const studentsPerPage = 5;

let selectedRows = [];
let studentToEdit;

let isValid = [false, false, false, false, false]; // For group, firstName, lastName, gender, dateOfBirth

const BASE_API_URL = 'http://localhost:8888';

const validationPatterns = {
    name: /^[A-Za-zА-Яа-я'\-]{2,50}$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
};

function tokenExpired() {
    sessionStorage.removeItem("auth_token");
    sessionStorage.removeItem("user");
    window.location.href = "/PI-Labs/auth/login.html";
}

async function logoutUser() {
    const token = sessionStorage.getItem("auth_token");
    if (!token) window.location.href = "login.html";

    try {
        await fetch(`${BASE_API_URL}/auth/logout`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        sessionStorage.removeItem("auth_token");
        sessionStorage.removeItem("user");
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
    }
}

async function fetchStudents(page) {
    try {
        const token = sessionStorage.getItem("auth_token");
        console.log(token);
        if (!token) {
            window.location.href = "login.html";
            return { total: 0, perPage: studentsPerPage };
        }

        const response = await fetch(`${BASE_API_URL}/students/?page=${page}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
        });
        if (response.status === 401) {
            tokenExpired();
            return { total: 0, perPage: studentsPerPage };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to fetch students');
        studentsList = data.students;
        return { total: data.total, perPage: data.perPage };
    } catch (error) {
        console.error("Error fetching students:", error);
        alert("Failed to fetch students: " + error.message);
        return { total: 0, perPage: studentsPerPage };
    }
}

function displayStudents() {
    table.innerHTML = `
        <tr>
            <th>
                <label for="idStudentMain" id="idLabel">id</label>
                <input type="checkbox" class="checkbox" id="idStudentMain">
            </th>
            <th>Group</th>
            <th>Name</th>
            <th>Gender</th>
            <th>Birthday</th>
            <th>Status</th>
            <th>Options</th>
        </tr>
    `;

    studentsList.forEach((student, index) => {
        const row = document.createElement("tr");
        row.classList.add("Students");
        row.innerHTML = `
            <td>
                <label for="${index}" class="idStudent" style="visibility: hidden;">${student.id}</label>
                <input type="checkbox" class="checkbox" id="${index}" value="${student.id}">
            </td>
            <td><p>${student.group_name}</p></td>
            <td><p>${student.first_name} ${student.last_name}</p></td>
            <td><p>${student.gender}</p></td>
            <td><p>${student.date_of_birth}</p></td>
            <td>
                <img class="${student.status ? 'status-on' : 'status-off'}" 
                     src="assets/${student.status ? 'status_on.png' : 'status_off.png'}" 
                     alt="Status"/>
            </td>
            <td>
                <button id="optionsEdit">edit</button>
                <button id="optionsDelete">delete</button>
            </td>
        `;
        table.appendChild(row);
    });

    attachRowListeners();
}

function updatePagination(total) {
    const totalPages = Math.ceil(total / studentsPerPage);
    page = Math.max(1, Math.min(page, totalPages));

    paginationContainer.innerHTML = `
        <button id="previousPage" class="tableStudents_pagination_btn" ${page === 1 ? "disabled" : ""} data-page="${page - 1}"><b>«</b></button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        paginationContainer.innerHTML += `
            <button id="page${i}" class="tableStudents_pagination_btn" ${i === page ? "disabled" : ""} data-page="${i}"><b>${i}</b></button>
        `;
    }

    paginationContainer.innerHTML += `
        <button id="nextPage" class="tableStudents_pagination_btn" ${page === totalPages ? "disabled" : ""} data-page="${page + 1}"><b>»</b></button>
    `;

    document.querySelectorAll(".tableStudents_pagination_btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const newPage = parseInt(btn.getAttribute("data-page"));
            if (!isNaN(newPage)) {
                page = newPage;
                updateTable();
            }
        });
    });
}

async function updateTable() {
    const { total } = await fetchStudents(page);
    displayStudents();
    updatePagination(total);
}

function attachRowListeners() {
    const selectAll = document.getElementById("idStudentMain");
    if (selectAll) {
        selectAll.addEventListener("change", (e) => {
            document.querySelectorAll(".checkbox").forEach((checkbox) => {
                checkbox.checked = e.target.checked;
            });
        });
    }

    document.querySelectorAll(".checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", (e) => {
            if (!e.target.checked) {
                document.getElementById("idStudentMain").checked = false;
            } else if (
                Array.from(document.querySelectorAll(".checkbox")).every((c) => c.checked)
            ) {
                document.getElementById("idStudentMain").checked = true;
            }
        });
    });

    document.querySelectorAll("#optionsEdit").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            const checkbox = row.querySelector(".checkbox");
            if (!checkbox.checked) return;
            const id = parseInt(row.querySelector(".idStudent").textContent);
            const student = studentsList.find(s => s.id === id);
            studentToEdit = student;
            document.getElementById("newStudentH2").textContent = "Edit Student";
            const groupInput = document.getElementById("group");
            const firstNameInput = document.getElementById("firstName");
            const lastNameInput = document.getElementById("lastName");
            const genderInput = document.getElementById("gender");
            const birthdayInput = document.getElementById("dateOfBirth");
            if (groupInput) groupInput.value = student.group_name;
            if (firstNameInput) firstNameInput.value = student.first_name;
            if (lastNameInput) lastNameInput.value = student.last_name;
            if (genderInput) genderInput.value = student.gender;
            if (birthdayInput) birthdayInput.value = student.date_of_birth;
            clearErrors();
            document.getElementById("addEditStudent").style.display = "block";
        });
    });

    document.querySelectorAll("#optionsDelete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            const checkbox = row.querySelector(".checkbox");
            if (!checkbox.checked) return;
            selectedRows = Array.from(
                document.querySelectorAll(".checkbox:checked")
            ).map((c) => c.closest("tr"));
            const message =
                selectedRows.length > 1
                    ? "Are you sure you want to delete those students?"
                    : `Are you sure you want to delete ${selectedRows[0].querySelector("td:nth-child(3) p").textContent}?`;
            document.getElementById("warningMessage").textContent = message;
            document.getElementById("deleteStudent").style.display = "block";
        });
    });
}

function clearErrors() {
    const inputs = ['group', 'firstName', 'lastName', 'gender', 'dateOfBirth'];
    inputs.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            const container = element.parentElement;
            container.classList.remove('error');
            const errorMessage = container.querySelector('.errorMessage');
            if (errorMessage) errorMessage.textContent = '';
        } else {
            console.warn(`Element with ID ${id} not found in DOM`);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Set up user display and logout
    const user = JSON.parse(sessionStorage.getItem("user"));
    if (user) {
        const profileUsername = document.getElementById("profileName");
        if (profileUsername) {
            profileUsername.textContent = `${user.first_name} ${user.last_name}`;
        } else {
            console.warn("Element with ID 'profileName' not found in DOM");
        }
    } else {
        window.location.href = "login.html";
    }

    const logoutBtn = document.getElementById("logout_btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            logoutUser();
        });
    } else {
        console.warn("Element with ID 'logout_btn' not found in DOM");
    }

    // Notification animation
    const bell = document.getElementById("bell");
    if (bell) bell.style.animation = "skew 3s 1";
    setTimeout(() => {
        const notificationStatus = document.getElementById("notification-status");
        if (notificationStatus) notificationStatus.style.opacity = "100%";
    }, 900);

    // Burger menu toggle
    const menuBtn = document.getElementById("menuBtn");
    if (menuBtn) {
        menuBtn.addEventListener("click", () => {
            const menu = document.getElementById("navbarBurger");
            if (menu) {
                menu.style.display = menu.style.display === "block" ? "none" : "block";
            }
        });
    }

    // Window resize handler
    window.addEventListener("resize", () => {
        const navbarBurger = document.getElementById("navbarBurger");
        if (navbarBurger && window.innerWidth > 768) {
            navbarBurger.style.display = "none";
        }
    });

    // Check if form inputs exist
    const groupInput = document.getElementById("group");
    const firstNameInput = document.getElementById("firstName");
    const lastNameInput = document.getElementById("lastName");
    const genderInput = document.getElementById("gender");
    const birthdayInput = document.getElementById("dateOfBirth");

    const missingInputs = [];
    if (!groupInput) missingInputs.push("group");
    if (!firstNameInput) missingInputs.push("firstName");
    if (!lastNameInput) missingInputs.push("lastName");
    if (!genderInput) missingInputs.push("gender");
    if (!birthdayInput) missingInputs.push("dateOfBirth");

    if (missingInputs.length > 0) {
        console.error(`Missing form inputs: ${missingInputs.join(", ")}. Please check index.html IDs.`);
        return;
    }

    updateTable();

    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
        backdrop.addEventListener("click", (e) => {
            const modal = e.target.closest(".modal-window");
            if (modal) modal.style.display = "none";
        });
    });

    const deleteBtn = document.getElementById("delete");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
            const token = sessionStorage.getItem("auth_token");
            const ids = selectedRows.map(
                (row) => parseInt(row.querySelector(".idStudent").textContent)
            );
            try {
                const deletePromises = ids.map(id =>
                    fetch(`${BASE_API_URL}/students/${id}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                    }).then(response => {
                        if (response.status === 401) {
                            tokenExpired();
                            return { success: false };
                        }
                        response.json()
                    })
                );
                const results = await Promise.all(deletePromises);
                const failed = results.find(result => !result.success);
                if (failed) {
                    alert(failed.error || 'Failed to delete students');
                } else {
                    updateTable();
                    selectedRows = [];
                    document.getElementById("deleteStudent").style.display = "none";
                }
            } catch (error) {
                console.error("Error deleting students:", error);
                alert("Failed to delete students: " + error.message);
            }
        });
    }

    const cancelDeleteBtn = document.getElementById("cancelDelete");
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener("click", () => {
            document.getElementById("deleteStudent").style.display = "none";
        });
    }

    const closeDeleteBtn = document.getElementById("closeDelete");
    if (closeDeleteBtn) {
        closeDeleteBtn.addEventListener("click", () => {
            document.getElementById("deleteStudent").style.display = "none";
        });
    }

    const addStudentBtn = document.getElementById("addStudent");
    if (addStudentBtn) {
        addStudentBtn.addEventListener("click", () => {
            document.querySelectorAll(".input").forEach((c) => c.classList.remove("error"));
            const form = document.getElementById("form");
            if (form) form.reset();
            document.getElementById("newStudentH2").textContent = "New Student";
            clearErrors();
            studentToEdit = null;
            document.getElementById("addEditStudent").style.display = "block";
        });
    }

    groupInput.addEventListener("change", (e) => {
        isValid[0] = e.target.value !== "";
        e.target.parentElement.classList.toggle("error", !isValid[0]);
        e.target.parentElement.querySelector(".errorMessage").textContent = isValid[0] ? "" : "Please select group.";
    });

    firstNameInput.addEventListener("change", (e) => {
        isValid[1] = validationPatterns.name.test(e.target.value);
        e.target.parentElement.classList.toggle("error", !isValid[1]);
        e.target.parentElement.querySelector(".errorMessage").textContent = isValid[1] ? "" : "Please enter valid name (A-z, А-я, 2-50 characters).";
    });

    lastNameInput.addEventListener("change", (e) => {
        isValid[2] = validationPatterns.name.test(e.target.value);
        e.target.parentElement.classList.toggle("error", !isValid[2]);
        e.target.parentElement.querySelector(".errorMessage").textContent = isValid[2] ? "" : "Please enter valid name (A-z, А-я, 2-50 characters).";
    });

    genderInput.addEventListener("change", (e) => {
        isValid[3] = e.target.value !== "";
        e.target.parentElement.classList.toggle("error", !isValid[3]);
        e.target.parentElement.querySelector(".errorMessage").textContent = isValid[3] ? "" : "Please select gender.";
    });

    birthdayInput.addEventListener("change", (e) => {
        isValid[4] = false;
        e.target.parentElement.classList.add("error");
        if (e.target.value && validationPatterns.date.test(e.target.value)) {
            const birthDate = new Date(e.target.value);
            const today = new Date();
            if (birthDate < today) {
                isValid[4] = true;
                e.target.parentElement.classList.remove("error");
                e.target.parentElement.querySelector(".errorMessage").textContent = "";
            } else {
                e.target.parentElement.querySelector(".errorMessage").textContent = "Date of birth cannot be in the future.";
            }
        } else {
            e.target.parentElement.querySelector(".errorMessage").textContent = "Valid date is required.";
        }
    });

    const form = document.getElementById("form");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (e.submitter !== document.getElementById("confirm")) return;

            const event = new Event("change");
            groupInput.dispatchEvent(event);
            firstNameInput.dispatchEvent(event);
            lastNameInput.dispatchEvent(event);
            genderInput.dispatchEvent(event);
            birthdayInput.dispatchEvent(event);

            if (!isValid.every((item) => item)) return;
            isValid = [false, false, false, false, false];

            const studentData = {
                group_name: groupInput.value,
                first_name: firstNameInput.value,
                last_name: lastNameInput.value,
                gender: genderInput.value,
                date_of_birth: birthdayInput.value,
            };

            try {
                const token = sessionStorage.getItem("auth_token");
                const method = studentToEdit ? "PUT" : "POST";
                const url = studentToEdit ? `${BASE_API_URL}/students/${studentToEdit.id}` : `${BASE_API_URL}/students/`;
                const response = await fetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(studentData),
                });
                if (response.status === 401) {
                    tokenExpired();
                    return;
                }
                const result = await response.json();
                if (result.success) {
                    updateTable();
                    document.getElementById("addEditStudent").style.display = "none";
                    studentToEdit = null;
                } else {
                    if (result.errors) {
                        Object.keys(result.errors).forEach((key) => {
                            const inputId = {
                                group_name: 'group',
                                first_name: 'firstName',
                                last_name: 'lastName',
                                gender: 'gender',
                                date_of_birth: 'dateOfBirth'
                            }[key] || key;
                            const container = document.getElementById(inputId)?.parentElement;
                            if (container) {
                                container.classList.add('error');
                                container.querySelector('.errorMessage').textContent = result.errors[key];
                            }
                        });
                    } else {
                        alert(result.error || 'Failed to save student');
                    }
                }
            } catch (error) {
                console.error("Error saving student:", error);
                alert("Failed to save student: " + error.message);
            }
        });
    }

    const cancelBtn = document.getElementById("cancel");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            document.getElementById("addEditStudent").style.display = "none";
            clearErrors();
            studentToEdit = null;
        });
    }

    const closeBtn = document.getElementById("close");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            document.getElementById("addEditStudent").style.display = "none";
            clearErrors();
            studentToEdit = null;
        });
    }
});