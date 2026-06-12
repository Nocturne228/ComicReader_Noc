import { lsGet } from "./utils.js";

var activeJob = null;
var viewMode = lsGet("@viewMode", "reader");

export function getActiveJob() {
    return activeJob;
}

export function setActiveJob(job) {
    activeJob = job;
}

export function getViewMode() {
    return viewMode;
}

export function setViewMode(mode) {
    viewMode = mode;
}
