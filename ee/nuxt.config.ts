// Marks this directory as a Nuxt layer so the root config can pull it in via
// `extends: ["./ee"]`. Server routes/utils and app components/composables/pages
// placed under ee/server and ee/app are merged into the main build automatically.
//
// Code in this directory is licensed separately from the rest of the repo —
// see ee/LICENSE and ee/README.md before adding anything here.
export default defineNuxtConfig({})
