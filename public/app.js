const form = document.getElementById("generate-form");
const formStatus = document.getElementById("form-status");
const jobsTbody = document.getElementById("jobs-tbody");
const detailCard = document.getElementById("detail-card");
const detailContent = document.getElementById("detail-content");

let selectedJobId = null;
let pollTimer = null;

function statusBadge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

async function readJsonResponse(res) {
  const text = await res.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function fetchJobs() {
  try {
    const res = await fetch("/jobs");
    const data = await readJsonResponse(res);

    if (!res.ok) {
      throw new Error(data?.error || `Failed to load jobs (${res.status})`);
    }

    const jobs = Array.isArray(data) ? data : [];
    renderJobsTable(jobs);

    if (selectedJobId) {
      const current = jobs.find((j) => j.id === selectedJobId);
      if (current) renderDetail(current);
    }
  } catch (err) {
    formStatus.textContent = `Jobs unavailable: ${getErrorMessage(err)}`;
  }
}

function renderJobsTable(jobs) {
  jobsTbody.innerHTML = "";
  for (const job of jobs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(job.productName)}</td>
      <td>${statusBadge(job.status)}</td>
      <td>${formatDate(job.createdAt)}</td>
      <td><button class="view-link" data-id="${job.id}">View</button></td>
    `;
    jobsTbody.appendChild(tr);
  }

  jobsTbody.querySelectorAll(".view-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedJobId = btn.dataset.id;
      const job = jobs.find((j) => j.id === selectedJobId);
      if (job) renderDetail(job);
    });
  });
}

function renderDetail(job) {
  detailCard.hidden = false;

  const referenceFigure = job.referenceImageUrl
    ? `<figure><img src="${job.referenceImageUrl}" alt="Reference product image" /><figcaption>Reference image</figcaption></figure>`
    : `<figure><figcaption>No reference image provided</figcaption></figure>`;

  const resultFigure = job.resultImageUrl
    ? `<figure><img src="${job.resultImageUrl}" alt="Generated image" /><figcaption>Generated result</figcaption></figure>`
    : `<figure><figcaption>${job.status === "failed" ? "Generation failed" : "Result not ready yet…"}</figcaption></figure>`;

  const promptBox = job.generatedPrompt
    ? `<div class="prompt-box"><strong>Generated prompt:</strong> ${escapeHtml(job.generatedPrompt)}</div>`
    : "";

  const errorBox = job.error
    ? `<div class="prompt-box error-box"><strong>Error:</strong> ${escapeHtml(job.error)}</div>`
    : "";

  detailContent.innerHTML = `
    <p><strong>${escapeHtml(job.productName)}</strong> ${statusBadge(job.status)}</p>
    <p>${escapeHtml(job.description)}</p>
    <div class="detail-grid">
      ${referenceFigure}
      ${resultFigure}
      ${promptBox}
      ${errorBox}
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formStatus.textContent = "Submitting…";

  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;

  try {
    const formData = new FormData(form);
    const res = await fetch("/generate", { method: "POST", body: formData });
    const data = await readJsonResponse(res);

    if (!res.ok) {
      throw new Error(data?.error || "Request failed");
    }

    formStatus.textContent = `Job ${data.id} submitted.`;
    form.reset();
    selectedJobId = data.id;
    await fetchJobs();
  } catch (err) {
    formStatus.textContent = `Error: ${getErrorMessage(err)}`;
  } finally {
    submitButton.disabled = false;
  }
});

fetchJobs();
pollTimer = setInterval(fetchJobs, 2000);
