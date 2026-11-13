function fillVerified(fields, only = null) {
  const aliases = {
    name: ["name", "full name", "your name", "founder name"],
    firstName: ["first name", "given name"],
    lastName: ["last name", "family name", "surname"],
    salaryExpectations: ["salary expectations", "desired salary"],
    portfolio: ["portfolio", "portfolio url"],
    founderBackground: ["founder background", "founder bio"],
    email: ["email", "email address", "your email"],
    phone: ["phone", "phone number"],
    company: ["company", "company name", "startup name"],
    website: ["website", "company website", "personal website"],
    linkedin: ["linkedin", "linkedin url", "linkedin profile"],
    description: [
      "company description",
      "describe your company",
      "what does your company do?",
    ],
    skills: ["skills"],
    workHistory: ["work history", "work experience", "employment history"],
    education: ["education", "education history"],
    address: ["address", "mailing address"],
    resumeText: ["resume text", "resume details"],
    traction: ["traction"],
    progress: ["progress"],
    businessModel: ["business model"],
    fundingGoals: ["funding goals", "funding amount"],
    legalStructure: ["legal structure"],
  };
  let filled = 0;
  const missing = [],
    unsupported = [];
  const report = [];
  let index = -1;
  for (const el of document.querySelectorAll("input,textarea,select")) {
    index++;
    if (only !== null && index !== only) continue;
    if (!el.getClientRects().length || el.disabled || el.readOnly) continue;
    const type = (el.type || "").toLowerCase();
    const label = (
      Array.from(el.labels || [])
        .map((l) => l.textContent)
        .join(" ") ||
      el.getAttribute("aria-label") ||
      (el.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim() ||
      el.placeholder ||
      el.name ||
      ""
    )
      .trim()
      .toLowerCase()
      .replace(/\s*\*\s*$/, "")
      .replace(/\s+/g, " ");
    const item = {
      index,
      label: label || "(unlabelled field)",
      status: "missing profile information or uncertain match",
    };
    report.push(item);
    if (
      /password|credit|card|payment|bank|ssn|social security|captcha|consent|agree|terms|privacy|subscribe/.test(
        label,
      ) ||
      [
        "password",
        "hidden",
        "submit",
        "button",
        "file",
        "reset",
        "image",
      ].includes(type)
    ) {
      item.status = "unsupported / manual review";
      if (!["hidden", "submit", "button", "password"].includes(type))
        unsupported.push(label || type);
      continue;
    }
    const candidates = (fields.customAnswers || []).filter(
      (a) =>
        typeof a.label === "string" && a.label.trim().toLowerCase() === label,
    );
    const custom = candidates.length === 1 ? candidates[0] : undefined;
    if (candidates.length > 1) {
      item.status = "uncertain duplicate answers";
      continue;
    }
    if (type === "radio") {
      const q = (
        el.closest("fieldset")?.querySelector("legend")?.textContent ||
        el.closest('[role="radiogroup"]')?.getAttribute("aria-label") ||
        ""
      )
        .trim()
        .toLowerCase();
      const answers = (fields.customAnswers || []).filter(
        (a) => a.type === "text" && a.label.trim().toLowerCase() === q,
      );
      const checked = Array.from(
        document.querySelectorAll('input[type="radio"]'),
      ).some((r) => r.name === el.name && r.checked);
      if (
        !checked &&
        answers.length === 1 &&
        answers[0].value.trim().toLowerCase() === label &&
        !/consent|agree|terms|privacy|subscribe/.test(q)
      ) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "checked",
        ).set.call(el, true);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
        item.status = "filled";
      } else item.status = checked ? "preserved" : "uncertain / manual review";
      continue;
    }
    if (type === "checkbox") {
      if (
        custom?.type === "checkbox" &&
        ["true", "false"].includes(custom.value) &&
        !el.checked
      ) {
        el.checked = custom.value === "true";
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.style.outline = "2px solid #6054e8";
        filled++;
        item.status = "filled";
      } else unsupported.push(label);
      continue;
    }
    const entry = Object.entries(aliases).find(([, names]) =>
      names.includes(label),
    );
    const value =
      custom?.type === "text" ? custom.value : entry && fields[entry[0]];
    if (el.value) {
      item.status = "preserved";
      continue;
    }
    if (!value || typeof value !== "string") {
      el.style.outline = "2px solid #e4a12a";
      missing.push(label || "(unlabelled field)");
      continue;
    }
    if (el.tagName === "SELECT") {
      const option = Array.from(el.options).find(
        (o) => o.text.trim().toLowerCase() === value.toLowerCase(),
      );
      if (!option) {
        unsupported.push(label);
        continue;
      }
      el.value = option.value;
    } else {
      const prototype =
        el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.style.outline = "2px solid #6054e8";
    filled++;
    item.status = "filled";
  }
  if (filled) {
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "Review unsaved application answers before leaving.";
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener(
      "submit",
      () => window.removeEventListener("beforeunload", warn),
      { once: true },
    );
  }
  return {
    filled,
    fields: report,
    missing,
    unsupported,
    frames: document.querySelectorAll("iframe").length,
    notice:
      "Review every answer. Existing answers preserved. Frames, custom widgets, consent, uploads and CAPTCHA require manual action. Retry newly rendered fields; create a new desktop task after navigation. Nothing submitted.",
  };
}
if (typeof module !== "undefined") module.exports = { fillVerified };
