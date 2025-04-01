document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("bell").style.animation = "skew 3s 1";
    setTimeout(() => {
        document.getElementById("notification-status").style.opacity = "100%";
    }, 900);
});

document.getElementById("menuBtn").addEventListener("click", () => {
    const menu = document.getElementById("navbarBurger");
    if (menu.style.display === "block") {
        menu.style.display = "none";
    } else {
        menu.style.display = "block";
    }
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
         document.getElementById("navbarBurger").style.display = "none";
    }
});

const students = [];
let count = 0;
let chosenTableRow = [];
let studentToEdit = null;

document.getElementById("addStudent").addEventListener("click", () => {
    document.getElementById("addEditStudent").style.display = "block";
    document.getElementById("newStudentH2").innerHTML = "New Student";
});

document.getElementById("idStudentMain").addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".checkbox");
    checkboxes.forEach((checkbox) => {
        checkbox.checked = document.getElementById("idStudentMain").checked;
    });
});

document.getElementById("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.submitter != document.getElementById("confirm")) return;
    if ([...document.querySelectorAll(".input")].some(e => e.classList.contains("error"))) return;

    if (studentToEdit == null) {
        const newStudent = document.createElement("tr");
        newStudent.classList.add("Students");
        document.getElementById("tableStudents").appendChild(newStudent);

        const newTableDataCheckbox = document.createElement("td");
        newStudent.appendChild(newTableDataCheckbox);
        const newLabel = document.createElement("label");
        newTableDataCheckbox.appendChild(newLabel);
        newLabel.classList.add("idStudent");
        newLabel.textContent = count;
        newLabel.style.visibility = "hidden";
        newLabel.setAttribute("for", count);
        const newCheckbox = document.createElement("input");
        newCheckbox.type = "checkbox";
        newTableDataCheckbox.appendChild(newCheckbox);
        newCheckbox.classList.add("checkbox");
        newCheckbox.id = count;

        const newTableDataGroup = document.createElement("td");
        newStudent.appendChild(newTableDataGroup);
        let group = document.getElementById("group").value;
        const newGroup = document.createElement("p");
        newGroup.textContent = group;
        newStudent.appendChild(newGroup);
        newTableDataGroup.appendChild(newGroup);

        const newTableDataName = document.createElement("td");
        newStudent.appendChild(newTableDataName);
        let name = document.getElementById("firstName").value + " " + document.getElementById("lastName").value;
        const newName = document.createElement("p");
        newName.textContent = name;
        newStudent.appendChild(newName);
        newTableDataName.appendChild(newName);
        let firstName = document.getElementById("firstName").value;
        let lastName = document.getElementById("lastName").value;

        const newTableDataGender = document.createElement("td");
        newStudent.appendChild(newTableDataGender);
        let gender = document.getElementById("gender").value;
        const newGender = document.createElement("p");
        newGender.textContent = gender;
        newStudent.appendChild(newGender);
        newTableDataGender.appendChild(newGender);

        const newTableDataDate = document.createElement("td");
        newStudent.appendChild(newTableDataDate);
        let dateOfBirth = document.getElementById("dateOfBirth").value;
        const newDate = document.createElement("p");
        newDate.textContent = dateOfBirth;
        newStudent.appendChild(newDate);
        newTableDataDate.appendChild(newDate);

        const newTableDataStatus = document.createElement("td");
        newStudent.appendChild(newTableDataStatus);
        let status = (count % 2 == 0) ? true : false;
        const newStatus = document.createElement("img");
        if (status) {
            newStatus.classList.add("status-on");
            newStatus.src = "assets/status_on.png";
        } else {
            newStatus.classList.add("status-off");
            newStatus.src = "assets/status_off.png";
        }
        newStatus.alt = "Status";
        newStudent.appendChild(newStatus);
        newTableDataStatus.appendChild(newStatus);

        const newTableDataOptions = document.createElement("td");
        newStudent.appendChild(newTableDataOptions);
        const newOptionsEdit = document.createElement("button");
        newOptionsEdit.id = "optionsEdit";
        newOptionsEdit.textContent = "edit";
        const newOptionsDelete = document.createElement("button");
        newOptionsDelete.id = "optionsDelete";
        newOptionsDelete.textContent = "delete";
        newTableDataOptions.appendChild(newOptionsEdit);
        newTableDataOptions.appendChild(newOptionsDelete);
        newOptionsEdit.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            const checkbox = row.querySelector("input[type='checkbox']");
            if (!checkbox.checked) return;
            document.getElementById("addEditStudent").style.display = "block";
            document.getElementById("newStudentH2").innerHTML = "Edit Student";

            const idInTableStudent = parseInt(row.querySelector("label").textContent);
            studentToEdit = students.find(student => student.id === idInTableStudent);
            console.log(JSON.stringify(student));
            document.getElementById("group").value = student.group;
            document.getElementById("firstName").value = student.firstName;
            document.getElementById("lastName").value = student.lastName;
            document.getElementById("gender").value = student.gender;
            document.getElementById("dateOfBirth").value = student.dateOfBirth;
        });
        newOptionsDelete.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            const checkbox = row.querySelector("input[type='checkbox']");
            if (!checkbox.checked) return;
            document.getElementById("deleteStudent").style.display = "block";
            chosenTableRow = [];

            const checkboxes = document.querySelectorAll(".checkbox");
            checkboxes.forEach((checkbox) => {
                if (checkbox.checked) {
                    chosenTableRow.push(checkbox.closest("tr"));
                }
            });


            if (chosenTableRow.length == 1) {
                document.getElementById("warningMessage").textContent = `Are you sure you want to delete ${name}?`;
            } else if (chosenTableRow.length > 1) {
                document.getElementById("warningMessage").textContent = `Are you sure you want to delete those students?`;
            }
        });

        const student = {
            group: group,
            firstName: firstName,
            lastName: lastName,
            gender: gender,
            dateOfBirth: dateOfBirth,
            status: status,
            id: count
        };
        students.push(student);

        count++;
        document.getElementById("addEditStudent").style.display = "none";
        document.getElementById("group").value = "";
        document.getElementById("firstName").value = "";
        document.getElementById("lastName").value = "";
        document.getElementById("gender").value = "Male";
        document.getElementById("dateOfBirth").value = "";
    } else {
        const row = document.querySelector(`#tableStudents label[for="${studentToEdit.id}"]`).closest("tr");

        studentToEdit.group = document.getElementById("group").value;
        studentToEdit.firstName = document.getElementById("firstName").value;
        studentToEdit.lastName = document.getElementById("lastName").value;
        studentToEdit.gender = document.getElementById("gender").value;
        studentToEdit.dateOfBirth = document.getElementById("dateOfBirth").value;

        row.children[1].querySelector("p").textContent = studentToEdit.group;
        row.children[2].querySelector("p").textContent = studentToEdit.firstName + " " + studentToEdit.lastName;
        row.children[3].querySelector("p").textContent = studentToEdit.gender;
        row.children[4].querySelector("p").textContent = studentToEdit.dateOfBirth;

        console.log("Changed to:");
        console.log(JSON.stringify(studentToEdit));
        document.getElementById("addEditStudent").style.display = "none";

        document.getElementById("group").value = "";
        document.getElementById("firstName").value = "";
        document.getElementById("lastName").value = "";
        document.getElementById("gender").value = "Male";
        document.getElementById("dateOfBirth").value = "";

        studentToEdit = null;
    }
});

document.getElementById("cancel").addEventListener("click", (e) => {
    document.getElementById("addEditStudent").style.display = "none";
    document.getElementById("addEditStudent").style.display = "none";
    document.getElementById("group").value = "";
    document.getElementById("firstName").value = "";
    document.getElementById("lastName").value = "";
    document.getElementById("gender").value = "Male";
    document.getElementById("dateOfBirth").value = "";
});
document.getElementById("close").addEventListener("click", (e) => {
    document.getElementById("addEditStudent").style.display = "none";
    document.getElementById("addEditStudent").style.display = "none";
    document.getElementById("group").value = "";
    document.getElementById("firstName").value = "";
    document.getElementById("lastName").value = "";
    document.getElementById("gender").value = "Male";
    document.getElementById("dateOfBirth").value = "";
});


document.getElementById("group").addEventListener("change", (e) => {
    e.target.parentElement.classList.remove("error");
    if(!e.target.value) {
        e.target.parentElement.classList.add("error");
    }
});

document.getElementById("firstName").addEventListener("change", (e) => {
    e.target.parentElement.classList.remove("error");
    const validationPatterns = {
        name: /^[A-Za-zА-Яа-я'\-]{2,50}$/,
    };
    if(!validationPatterns.name.test(e.target.value)) {
        e.target.parentElement.classList.add("error");
    }
});

document.getElementById("lastName").addEventListener("change", (e) => {
    e.target.parentElement.classList.remove("error");
    const validationPatterns = {
        name: /^[A-Za-zА-Яа-я'\-]{2,50}$/,
    };
    if(!validationPatterns.name.test(e.target.value)) {
        e.target.parentElement.classList.add("error");
    }
});

document.getElementById("gender").addEventListener("change", (e) => {
    e.target.parentElement.classList.remove("error");
    if(!e.target.value) {
        e.target.parentElement.classList.add("error");
    }
});

document.getElementById("dateOfBirth").addEventListener("change", (e) => {
    e.target.parentElement.classList.remove("error");
    const validationPatterns = {
        date: /^\d{4}-\d{2}-\d{2}$/
    };
    if(!validationPatterns.date.test(e.target.value)) {
        e.target.parentElement.classList.add("error");
    }
    let birthDate = new Date(e.target.value);
    let today = new Date();
    if (birthDate >= today) {
        e.target.parentElement.classList.add("error");
    }
});


document.getElementById("delete").addEventListener("click", (e) => {
    e.preventDefault();
    if (e.target != document.getElementById("delete")) return;

    chosenTableRow.forEach(row => {
        const studentId = row.querySelector("input[type='checkbox']").id;
        const rowIndex = students.findIndex(student => student.id === studentId);
        if (rowIndex !== -1) students.splice(rowIndex, 1);
        row.remove();
    });

    document.getElementById("deleteStudent").style.display = "none";
    chosenTableRow = [];
});
document.getElementById("c" +
    "ancelDelete").addEventListener("click", (e) => {
    document.getElementById("deleteStudent").style.display = "none";
});
document.getElementById("closeDelete").addEventListener("click", (e) => {
    document.getElementById("deleteStudent").style.display = "none";
});