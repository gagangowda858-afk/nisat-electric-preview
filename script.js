"use strict";

const SITE_CONFIG = {
  demoMode: false,
  appsScriptEndpoint: "https://script.google.com/macros/s/AKfycbyZ0vOiTaMX5TEBYF6ooHV_06ZKYNRZlkls3nT_2OVkse3ScwXRz7jKOo0wUzTLVO349Q/exec",
  businessPhone: "2145365555",
  showDemoBanner: false,
  formVersion: "nisat-web-1.0.0"
};

const formStartedAt = Date.now();
const form = document.querySelector("#service-form");
const submitButton = document.querySelector("#submit-button");
const errorSummary = document.querySelector("#error-summary");
const errorList = document.querySelector("#error-list");
const successState = document.querySelector("#success-state");
const submissionFrame = document.querySelector("#submission-frame");
const urgencyField = document.querySelector("#urgency");
const safetyWarning = document.querySelector("#safety-warning");
const descriptionField = document.querySelector("#description");
const descriptionCount = document.querySelector("#description-count");
const submitText = submitButton.querySelector(".button-text");
const submitLoading = submitButton.querySelector(".button-loading");

let isSubmitting = false;
let realSubmissionPending = false;
let realSubmissionTimeout = null;

initializeSite();

function initializeSite() {
  document.querySelector("#demo-banner").hidden = !SITE_CONFIG.showDemoBanner;
  document.querySelector("#current-year").textContent = String(new Date().getFullYear());
  populateTechnicalFields();
  bindEvents();
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", clearFieldErrorOnChange);
  form.addEventListener("change", clearFieldErrorOnChange);
  urgencyField.addEventListener("change", updateSafetyWarning);
  descriptionField.addEventListener("input", updateDescriptionCount);
  document.querySelector("#phone").addEventListener("blur", formatPhoneField);
  submissionFrame.addEventListener("load", handleSubmissionFrameLoad);
  window.addEventListener("message", handleSubmissionMessage);
}

function populateTechnicalFields() {
  const params = new URLSearchParams(window.location.search);
  const hiddenValues = {
    pageUrl: window.location.href,
    referringUrl: document.referrer || "Direct / unavailable",
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || "",
    utmCampaign: params.get("utm_campaign") || "",
    utmContent: params.get("utm_content") || "",
    utmTerm: params.get("utm_term") || "",
    deviceType: getDeviceType(),
    formVersion: SITE_CONFIG.formVersion
  };

  Object.entries(hiddenValues).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value;
  });
}

function getDeviceType() {
  if (window.matchMedia("(max-width: 620px)").matches) return "Mobile";
  if (window.matchMedia("(max-width: 1024px)").matches) return "Tablet";
  return "Desktop";
}

function updateSafetyWarning() {
  safetyWarning.hidden = urgencyField.value !== "Electrical safety concern";
}

function updateDescriptionCount() {
  descriptionCount.textContent = `${descriptionField.value.length} / 2000`;
}

function formatPhoneField() {
  const phoneField = document.querySelector("#phone");
  const digits = phoneField.value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length === 10) {
    phoneField.value = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
}

function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return;

  document.querySelector("#timeBeforeSubmission").value = String(Date.now() - formStartedAt);
  populateTechnicalFields();

  const errors = validateForm();
  if (errors.length) {
    showValidationErrors(errors);
    return;
  }

  const payload = getFormPayload();
  setSubmitting(true);

  if (SITE_CONFIG.demoMode) {
    console.group("Nisat Electric demo submission — no information was transmitted");
    console.info("Demo mode is ON. This payload remains in the local browser console:");
    console.table(payload);
    console.info("Payload object:", payload);
    console.groupEnd();
    window.setTimeout(showSuccess, 700);
    return;
  }

  if (!isValidProductionEndpoint(SITE_CONFIG.appsScriptEndpoint)) {
    showSubmissionError("The service form has not been connected yet. Please call (214) 536-5555.");
    return;
  }

  realSubmissionPending = true;
  form.action = SITE_CONFIG.appsScriptEndpoint;
  form.target = "submission-frame";

  realSubmissionTimeout = window.setTimeout(() => {
    if (!realSubmissionPending) return;
    realSubmissionPending = false;
    showSubmissionError("The request could not be confirmed. Please check your connection or call (214) 536-5555.");
  }, 18000);

  HTMLFormElement.prototype.submit.call(form);
}

function isValidProductionEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" &&
      url.hostname === "script.google.com" &&
      /\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname);
  } catch (_error) {
    return false;
  }
}

function handleSubmissionFrameLoad() {
  if (!realSubmissionPending) return;
  // Apps Script posts a tiny success/error message from inside the hidden frame.
  // The load event alone is not enough: an Apps Script validation error also loads.
}

function handleSubmissionMessage(event) {
  if (!realSubmissionPending || !event.data || event.data.source !== "nisat-electric") return;
  const trustedOrigin = event.origin === "https://script.google.com" ||
    /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/i.test(event.origin);
  if (!trustedOrigin) return;

  realSubmissionPending = false;
  window.clearTimeout(realSubmissionTimeout);
  if (event.data.ok === true) showSuccess();
  else showSubmissionError(event.data.message || "The request could not be recorded. Please call (214) 536-5555.");
}

function getFormPayload() {
  const payload = {};
  for (const [key, value] of new FormData(form).entries()) {
    payload[key] = typeof value === "string" ? value.trim() : value;
  }
  payload.smsPermission = document.querySelector("#smsPermission").checked ? "Yes" : "No";
  payload.submittedAtClient = new Date().toISOString();
  return payload;
}

function validateForm() {
  clearAllErrors();
  const errors = [];
  const requiredFields = [
    ["fullName", "Enter your full name."],
    ["phone", "Enter a phone number with 10 digits."],
    ["streetAddress", "Enter the service street address."],
    ["city", "Enter the service city."],
    ["zipCode", "Enter a valid 5-digit ZIP code."],
    ["propertyType", "Choose a property type."],
    ["serviceCategory", "Choose a service category."],
    ["urgency", "Choose the request urgency."],
    ["description", "Describe the issue or project."]
  ];

  requiredFields.forEach(([id, message]) => {
    const field = document.getElementById(id);
    if (!field.value.trim()) errors.push({ id, message });
  });

  const phone = document.querySelector("#phone");
  if (phone.value && normalizePhone(phone.value).length !== 10) {
    replaceOrAddError(errors, "phone", "Enter a U.S. phone number with 10 digits.");
  }

  const zip = document.querySelector("#zipCode");
  if (zip.value && !/^\d{5}(?:-\d{4})?$/.test(zip.value.trim())) {
    replaceOrAddError(errors, "zipCode", "Enter a 5-digit ZIP code (or ZIP+4). ");
  }

  const email = document.querySelector("#email");
  if (email.value && !email.validity.valid) {
    errors.push({ id: "email", message: "Enter a valid email address." });
  }

  const preferredContact = form.querySelector('input[name="preferredContact"]:checked');
  if (!preferredContact) {
    errors.push({ id: "preferredContact", focusId: "preferredContact", message: "Choose call, text, or email." });
  } else if (preferredContact.value === "Email" && !email.value.trim()) {
    replaceOrAddError(errors, "email", "Enter an email address if email is your preferred contact method.");
  }

  return errors;
}

function normalizePhone(value) {
  return value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function replaceOrAddError(errors, id, message) {
  const existing = errors.find((error) => error.id === id);
  if (existing) existing.message = message;
  else errors.push({ id, message });
}

function showValidationErrors(errors) {
  errorList.replaceChildren();
  errors.forEach((error) => {
    const field = error.id === "preferredContact"
      ? form.querySelector('input[name="preferredContact"]')
      : document.getElementById(error.id);
    const errorElement = document.getElementById(`${error.id}-error`);

    if (field) field.setAttribute("aria-invalid", "true");
    if (errorElement) errorElement.textContent = error.message;

    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = error.id === "preferredContact" ? "#preferredContact-error" : `#${error.id}`;
    link.textContent = error.message;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (field) field.focus();
    });
    listItem.append(link);
    errorList.append(listItem);
  });

  errorSummary.hidden = false;
  errorSummary.focus();
}

function clearFieldErrorOnChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;

  const errorId = target.name === "preferredContact" ? "preferredContact" : target.id;
  const errorElement = document.getElementById(`${errorId}-error`);
  if (errorElement) errorElement.textContent = "";

  if (target.name === "preferredContact") {
    form.querySelectorAll('input[name="preferredContact"]').forEach((radio) => radio.removeAttribute("aria-invalid"));
  } else {
    target.removeAttribute("aria-invalid");
  }
}

function clearAllErrors() {
  form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error").forEach((field) => { field.textContent = ""; });
  errorList.replaceChildren();
  errorSummary.hidden = true;
}

function setSubmitting(submitting) {
  isSubmitting = submitting;
  submitButton.disabled = submitting;
  submitButton.setAttribute("aria-busy", String(submitting));
  submitText.hidden = submitting;
  submitLoading.hidden = !submitting;
}

function showSuccess() {
  setSubmitting(false);
  clearAllErrors();
  form.hidden = true;
  document.querySelector(".form-card-head").hidden = true;
  successState.hidden = false;
  successState.focus();
}

function showSubmissionError(message) {
  setSubmitting(false);
  realSubmissionPending = false;
  window.clearTimeout(realSubmissionTimeout);
  errorList.replaceChildren();
  const item = document.createElement("li");
  item.textContent = message;
  errorList.append(item);
  errorSummary.hidden = false;
  errorSummary.focus();
}
