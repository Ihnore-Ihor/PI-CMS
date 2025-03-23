
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("bell").style.animation = "skew 3s 1"
})

document.getElementById("addStudent").addEventListener("click", () => {
    const newStudent = document.createElement("tr");
    newStudent.classList.add("Students");
    document.getElementById("tableStudents").appendChild(newStudent);

    const newTableDataCheckbox = document.createElement("td");
    newStudent.appendChild(newTableDataCheckbox);
    const newCheckbox = document.createElement("input");
    newCheckbox.type = "checkbox";
    newTableDataCheckbox.appendChild(newCheckbox);

    const newTableDataGroup = document.createElement("td");
    newStudent.appendChild(newTableDataGroup);
    let group = "group";
    const newGroup = document.createElement("p");
    newGroup.textContent = group;
    newStudent.appendChild(newGroup);
    newTableDataGroup.appendChild(newGroup);

    const newTableDataName = document.createElement("td");
    newStudent.appendChild(newTableDataName);
    let name = "name";
    const newName = document.createElement("p");
    newName.textContent = name;
    newStudent.appendChild(newName);
    newTableDataName.appendChild(newName);

    const newTableDataGender = document.createElement("td");
    newStudent.appendChild(newTableDataGender);
    let gender = "gender";
    const newGender = document.createElement("p");
    newGender.textContent = gender;
    newStudent.appendChild(newGender);
    newTableDataGender.appendChild(newGender);

    const newTableDataDate = document.createElement("td");
    newStudent.appendChild(newTableDataDate);
    let dateOfBirth = "date";
    const newDate = document.createElement("p");
    newDate.textContent = dateOfBirth;
    newStudent.appendChild(newDate);
    newTableDataDate.appendChild(newDate);

    const newTableDataStatus = document.createElement("td");
    newStudent.appendChild(newTableDataStatus);
    let status = true;
    const newStatus = document.createElement("img");
    if (status) {
        newStatus.classList.add("status-on");
        newStatus.src = "assets/status_on.png";
    } else {
        newStatus.classList.add("status-off");
        newStatus.src = "assets/status_off.png";
    }
    newStatus.altText = "Status";
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

})