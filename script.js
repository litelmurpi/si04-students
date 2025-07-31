// Global variables
let supabase = null;
let students = [];
let filteredStudents = [];
let currentEditId = null;

// DOM elements - Declare them after DOM is loaded
let studentList,
  searchInput,
  totalStudentsEl,
  displayedStudentsEl,
  connectionStatus,
  configModal,
  configForm,
  refreshBtn,
  sortSelect;

// Initialize DOM elements
function initializeElements() {
  studentList = document.getElementById("studentList");
  searchInput = document.getElementById("searchInput");
  totalStudentsEl = document.getElementById("totalStudents");
  displayedStudentsEl = document.getElementById("displayedStudents");
  connectionStatus = document.getElementById("connectionStatus");
  configModal = document.getElementById("configModal");
  configForm = document.getElementById("configForm");
  refreshBtn = document.getElementById("refreshBtn");
  sortSelect = document.getElementById("sortSelect");
}

// Initialize app
async function init() {
  initializeElements();

  // Check if we have Supabase credentials
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    showConfigModal();
    return;
  }

  // Initialize Supabase client
  try {
    updateConnectionStatus("connecting", "Connecting...");

    // Create Supabase client
    supabase = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey,
      {
        auth: {
          persistSession: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      }
    );

    // Test the connection first
    const { error: testError } = await supabase
      .from("students")
      .select("count", { count: "exact", head: true });

    if (testError) {
      throw new Error(`Connection test failed: ${testError.message}`);
    }

    updateConnectionStatus("connected", "Connected");
    await loadStudents();

    // Add event listeners after successful connection
    setupEventListeners();
  } catch (error) {
    console.error("Failed to initialize Supabase:", error);
    updateConnectionStatus("error", "Connection failed");

    // Show detailed error message
    studentList.innerHTML = `
            <div class="error-message">
                <h3>Connection Error</h3>
                <p>${error.message}</p>
                <div style="margin-top: 1rem;">
                    <p><strong>Troubleshooting steps:</strong></p>
                    <ol style="text-align: left; margin-top: 0.5rem;">
                        <li>Verify your Supabase URL is correct (should be https://[project-ref].supabase.co)</li>
                        <li>Check that your anon key is valid</li>
                        <li>Ensure your table is named 'students'</li>
                        <li>Check if Row Level Security (RLS) is enabled and configured properly</li>
                        <li>Make sure your internet connection is stable</li>
                    </ol>
                </div>
                <button class="btn btn-primary" style="margin-top: 1rem;" onclick="showConfigModal()">
                    Update Configuration
                </button>
            </div>
        `;
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Search input
  searchInput.addEventListener("input", applyAllFilters);

  // Filter selects
  document
    .getElementById("statusFilter")
    .addEventListener("change", applyAllFilters);
  document
    .getElementById("gradeFilter")
    .addEventListener("change", applyAllFilters);

  // Sort select
  sortSelect.addEventListener("change", (e) => {
    const [field, order] = e.target.value.split("-");

    filteredStudents.sort((a, b) => {
      let aValue, bValue;

      switch (field) {
        case "id":
          aValue = a.student_id;
          bValue = b.student_id;
          break;
        case "name":
          aValue = a.full_name;
          bValue = b.full_name;
          break;
        case "grade":
          const gradeOrder = { A: 1, B: 2, C: 3, D: 4, E: 5 };
          aValue = gradeOrder[a.grade] || 999;
          bValue = gradeOrder[b.grade] || 999;
          return order === "asc" ? aValue - bValue : bValue - aValue;
        case "attendance":
          aValue = a.attendance_percentage || 0;
          bValue = b.attendance_percentage || 0;
          return order === "desc" ? bValue - aValue : aValue - bValue;
        default:
          aValue = a.student_id;
          bValue = b.student_id;
      }

      if (field !== "grade" && field !== "attendance") {
        if (order === "asc") {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }
    });

    displayStudents();
  });

  // Refresh button
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML =
      '<div class="spinner" style="width: 16px; height: 16px; margin: 0;"></div> Refreshing...';

    await loadStudents();

    refreshBtn.disabled = false;
    refreshBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      Refresh
    `;
  });

  // Configuration form
  configForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // Ini sudah ada, pastikan tidak ada yang menggangu

    const url = document.getElementById("supabaseUrl").value.trim();
    const key = document.getElementById("supabaseKey").value.trim();

    if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
      alert(
        "Please enter a valid Supabase URL (https://[project-ref].supabase.co)"
      );
      return;
    }

    SUPABASE_CONFIG.url = url;
    SUPABASE_CONFIG.anonKey = key;
    localStorage.setItem(
      "supabaseConfig",
      JSON.stringify({ url, anonKey: key })
    );

    configModal.classList.remove("show");

    // Pastikan tidak ada redirect
    setTimeout(() => {
      init(); // Reinitialize app
    }, 100);

    return false; // Tambahan untuk memastikan form tidak submit
  });

  // Edit form
  document.getElementById("editForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const updates = {
      status: document.getElementById("editStatus").value,
      grade: document.getElementById("editGrade").value || null,
      attendance_percentage:
        parseInt(document.getElementById("editAttendance").value) || 0,
      notes: document.getElementById("editNotes").value || null,
      last_updated_by: "litelmurpi",
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from("students")
        .update(updates)
        .eq("id", currentEditId)
        .select();

      if (error) throw error;

      const index = students.findIndex((s) => s.id === currentEditId);
      if (index !== -1) {
        students[index] = { ...students[index], ...updates };
        applyAllFilters();
        displayStudents();
        updateStats();
      }

      closeEditModal();
      showNotification("Student updated successfully!", "success");
    } catch (error) {
      console.error("Error updating student:", error);
      showNotification("Error updating student: " + error.message, "error");
    }
  });

  // Modal close listeners
  configModal.addEventListener("click", (e) => {
    if (e.target === configModal) {
      configModal.classList.remove("show");
    }
  });

  document.getElementById("editModal").addEventListener("click", (e) => {
    if (e.target.id === "editModal") {
      closeEditModal();
    }
  });

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === ",") {
      showConfigModal();
    }
  });
}

// Show configuration modal
function showConfigModal() {
  if (!configModal) {
    configModal = document.getElementById("configModal");
  }

  configModal.classList.add("show");

  if (SUPABASE_CONFIG.url) {
    document.getElementById("supabaseUrl").value = SUPABASE_CONFIG.url;
  }
  if (SUPABASE_CONFIG.anonKey) {
    document.getElementById("supabaseKey").value = SUPABASE_CONFIG.anonKey;
  }

  // Reset test result
  const testResult = document.getElementById("testResult");
  if (testResult) {
    testResult.innerHTML = "";
  }

  // Focus on first input
  setTimeout(() => {
    document.getElementById("supabaseUrl").focus();
  }, 100);
}

// Update connection status
function updateConnectionStatus(status, text) {
  if (!connectionStatus) return;

  connectionStatus.className = `connection-status ${status}`;
  const statusText = connectionStatus.querySelector(".status-text");
  if (statusText) {
    statusText.textContent = text;
  }
}

// Load students from Supabase
async function loadStudents() {
  try {
    updateConnectionStatus("connected", "Loading...");
    studentList.innerHTML =
      '<div class="loader"><div class="spinner"></div><p>Loading students from database...</p></div>';

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("student_id", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "No data found. The table might be empty or you might not have permission to access it."
      );
    }

    students = data;
    applyAllFilters();

    updateConnectionStatus(
      "connected",
      `Connected (${students.length} students)`
    );
  } catch (error) {
    console.error("Error loading students:", error);
    updateConnectionStatus("error", "Failed to load data");

    let errorMessage = error.message;

    if (
      error.message.includes("relation") &&
      error.message.includes("does not exist")
    ) {
      errorMessage =
        "Table not found. Make sure you've created the 'students' table in your Supabase database.";
    } else if (error.message.includes("permission denied")) {
      errorMessage =
        "Permission denied. Check your Row Level Security (RLS) policies.";
    } else if (error.message.includes("JWT")) {
      errorMessage = "Authentication error. Your anon key might be invalid.";
    }

    studentList.innerHTML = `
      <div class="error-message">
          <h3>Error Loading Students</h3>
          <p>${errorMessage}</p>
          <div style="margin-top: 1rem;">
              <button class="btn btn-primary" onclick="showConfigModal()">Update Configuration</button>
              <button class="btn" onclick="window.open('https://supabase.com/docs/guides/api#error-codes', '_blank')">
                  View Error Codes
              </button>
          </div>
      </div>
    `;

    // Don't call applyAllFilters() here when there's an error
    // Instead, just reset the stats safely
    if (totalStudentsEl) totalStudentsEl.textContent = "0";
    if (displayedStudentsEl) displayedStudentsEl.textContent = "0";
    const activeStudentsEl = document.getElementById("activeStudents");
    if (activeStudentsEl) activeStudentsEl.textContent = "0";
    const avgAttendanceEl = document.getElementById("avgAttendance");
    if (avgAttendanceEl) avgAttendanceEl.textContent = "0%";
  }
}

// Display students with notes field
function displayStudents() {
  if (!studentList) return;

  if (filteredStudents.length === 0) {
    studentList.innerHTML = `
      <div class="no-results">
          <p>No students found</p>
          <small>Try adjusting your search criteria</small>
      </div>
    `;
    return;
  }

  studentList.innerHTML = filteredStudents
    .map(
      (student) => `
        <div class="student-card">
            <div class="student-info">
                <div class="student-id">${student.student_id}</div>
                <div class="student-name">${student.full_name}</div>
            </div>
            <div class="notes-section">
                <div class="notes-header">
                    <span class="notes-label">Notes</span>
                    <button class="edit-notes-btn" onclick="toggleNotesEdit(${
                      student.id
                    })">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Edit
                    </button>
                </div>
                <div id="notes-view-${student.id}" class="notes-content ${
        !student.notes ? "empty" : ""
      }">
                    ${student.notes || "No notes yet"}
                </div>
                <div id="notes-edit-${student.id}" style="display: none;">
                    <textarea class="notes-textarea" id="notes-textarea-${
                      student.id
                    }">${student.notes || ""}</textarea>
                    <div class="notes-actions">
                        <button class="btn btn-small btn-cancel" onclick="cancelNotesEdit(${
                          student.id
                        })">Cancel</button>
                        <button class="btn btn-small btn-save" onclick="saveNotes(${
                          student.id
                        })">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `
    )
    .join("");
}

// Toggle notes editing mode
window.toggleNotesEdit = function (studentId) {
  const viewDiv = document.getElementById(`notes-view-${studentId}`);
  const editDiv = document.getElementById(`notes-edit-${studentId}`);
  const textarea = document.getElementById(`notes-textarea-${studentId}`);

  viewDiv.style.display = "none";
  editDiv.style.display = "block";
  textarea.focus();

  // Set cursor at the end of text
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
};

// Cancel notes editing
window.cancelNotesEdit = function (studentId) {
  const viewDiv = document.getElementById(`notes-view-${studentId}`);
  const editDiv = document.getElementById(`notes-edit-${studentId}`);
  const textarea = document.getElementById(`notes-textarea-${studentId}`);

  // Restore original value
  const student = students.find((s) => s.id === studentId);
  textarea.value = student.notes || "";

  viewDiv.style.display = "block";
  editDiv.style.display = "none";
};

// Save notes to database
window.saveNotes = async function (studentId) {
  const textarea = document.getElementById(`notes-textarea-${studentId}`);
  const newNotes = textarea.value.trim();

  // Show saving indicator
  const editDiv = document.getElementById(`notes-edit-${studentId}`);
  const originalContent = editDiv.innerHTML;
  editDiv.innerHTML =
    '<div class="saving-indicator"><div class="spinner"></div>Saving...</div>';

  try {
    const updates = {
      notes: newNotes || null,
      last_updated_by: "litelmurpi",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("students")
      .update(updates)
      .eq("id", studentId)
      .select();

    if (error) throw error;

    // Update local data
    const index = students.findIndex((s) => s.id === studentId);
    if (index !== -1) {
      students[index] = { ...students[index], ...updates };

      // Update filtered students as well
      const filteredIndex = filteredStudents.findIndex(
        (s) => s.id === studentId
      );
      if (filteredIndex !== -1) {
        filteredStudents[filteredIndex] = {
          ...filteredStudents[filteredIndex],
          ...updates,
        };
      }
    }

    // Update the view
    const viewDiv = document.getElementById(`notes-view-${studentId}`);
    viewDiv.textContent = newNotes || "No notes yet";
    viewDiv.className = newNotes ? "notes-content" : "notes-content empty";

    // Restore edit div content and hide it
    editDiv.innerHTML = originalContent;
    viewDiv.style.display = "block";
    editDiv.style.display = "none";

    showNotification("Notes updated successfully!", "success");
  } catch (error) {
    console.error("Error updating notes:", error);

    // Restore edit div content
    editDiv.innerHTML = originalContent;

    showNotification("Error updating notes: " + error.message, "error");
  }
};

// Open edit modal
function openEditModal(studentId) {
  const student = students.find((s) => s.id === studentId);
  if (!student) return;

  currentEditId = studentId;

  document.getElementById("editId").value = student.id;
  document.getElementById("editStudentId").value = student.student_id;
  document.getElementById("editFullName").value = student.full_name;
  document.getElementById("editStatus").value = student.status || "active";
  document.getElementById("editGrade").value = student.grade || "";
  document.getElementById("editAttendance").value =
    student.attendance_percentage || 0;
  document.getElementById("editNotes").value = student.notes || "";

  document.getElementById("editModal").classList.add("show");
}

// Close edit modal
function closeEditModal() {
  document.getElementById("editModal").classList.remove("show");
  currentEditId = null;
}

// Apply all filters
function applyAllFilters() {
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const statusFilter = document.getElementById("statusFilter")?.value || "";
  const gradeFilter = document.getElementById("gradeFilter")?.value || "";

  filteredStudents = students.filter((student) => {
    const matchesSearch =
      searchTerm === "" ||
      student.student_id.toLowerCase().includes(searchTerm) ||
      student.full_name.toLowerCase().includes(searchTerm);

    const matchesStatus =
      statusFilter === "" || student.status === statusFilter;
    const matchesGrade = gradeFilter === "" || student.grade === gradeFilter;

    return matchesSearch && matchesStatus && matchesGrade;
  });

  displayStudents();
  updateStats();
}

// Update stats with new metrics
function updateStats() {
  // Add safety checks for all elements
  if (!totalStudentsEl || !displayedStudentsEl) {
    // Try to reinitialize if elements are missing
    totalStudentsEl = document.getElementById("totalStudents");
    displayedStudentsEl = document.getElementById("displayedStudents");

    // If still missing, exit early
    if (!totalStudentsEl || !displayedStudentsEl) return;
  }

  totalStudentsEl.textContent = students.length;
  displayedStudentsEl.textContent = filteredStudents.length;

  const activeStudentsEl = document.getElementById("activeStudents");
  if (activeStudentsEl) {
    const activeCount = students.filter((s) => s.status === "active").length;
    activeStudentsEl.textContent = activeCount;
  }

  const avgAttendanceEl = document.getElementById("avgAttendance");
  if (avgAttendanceEl && students.length > 0) {
    const avgAttendance =
      students.reduce((sum, s) => sum + (s.attendance_percentage || 0), 0) /
      students.length;
    avgAttendanceEl.textContent = Math.round(avgAttendance) + "%";
  }
}

// Export functionality
function exportData() {
  const headers = [
    "Student ID",
    "Full Name",
    "Status",
    "Grade",
    "Attendance %",
    "Notes",
  ];
  const rows = filteredStudents.map((s) => [
    s.student_id,
    s.full_name,
    s.status || "active",
    s.grade || "",
    s.attendance_percentage || 0,
    s.notes || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `students_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
}

// Notification system
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    background: ${type === "success" ? "#10b981" : "#ef4444"};
    color: white;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 9999;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add CSS animation
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", init);
