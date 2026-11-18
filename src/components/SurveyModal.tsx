import { SHOW_SURVEY_MODAL } from "astro:env/client";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useEffect, useState } from "react";

/**
 * Rider-survey prompt shown once per browser session, shortly after a page
 * loads. Layout and copy follow the modal on alerts.metro.net (EN + ES survey
 * links). Enabled by the `SHOW_SURVEY_MODAL` environment variable (declared in
 * the Astro env schema in astro.config.mjs): set to `true` on Render, left
 * unset locally so the modal never appears in dev.
 *
 * The flag is imported from `astro:env/client`: Astro schema variables are
 * NOT exposed on `import.meta.env` in the browser in dev, only via the
 * virtual module.
 */

// Records that the modal has been seen this session. sessionStorage survives
// reloads and in-site navigations within the tab, and clears when the tab
// closes.
const SESSION_STORAGE_KEY = "survey-modal-seen";

// Small delay so the page has a chance to paint before the modal pops.
const OPEN_DELAY_MS = 500;

const SURVEY_URL_EN = "https://survey.cmix.com/3764F823/V99TJ5KM/en-US";
const SURVEY_URL_ES = "https://survey.cmix.com/3764F823/VM4VBP3X/es-US";

export default function SurveyModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!SHOW_SURVEY_MODAL) return;

    try {
      if (sessionStorage.getItem(SESSION_STORAGE_KEY) !== null) return;
      // Mark the session as seen the moment we decide to show the modal (not
      // on dismiss), so a reload or navigation mid-modal never re-displays it.
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    } catch {
      // Storage unavailable (e.g. strict privacy mode): show the modal anyway.
    }

    const timer = setTimeout(() => setIsOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Transition show={isOpen}>
      {/* z-[2000] sits above Leaflet's stacking (its controls reach
          z-index 1000 on line pages) and everything else on the page. */}
      <Dialog onClose={() => setIsOpen(false)} className="relative z-[2000]">
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="translate-y-5 opacity-0"
              enterTo="translate-y-0 opacity-100"
              leave="ease-in duration-200"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="translate-y-5 opacity-0"
            >
              <DialogPanel className="bg-background-white text-metro-text relative w-full max-w-160 p-5 shadow-xl sm:p-15">
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setIsOpen(false)}
                  className="text-blue hover:text-dark-blue absolute top-1 right-4 cursor-pointer text-4xl leading-none"
                >
                  &times;
                </button>

                <DialogTitle className="text-2xl font-bold sm:text-3xl">
                  Take a Metro Survey
                </DialogTitle>

                <p className="mt-4 mb-5 text-lg leading-normal sm:text-xl">
                  Take a survey on your Metro riding experience for a chance to
                  win a $100 gift card!
                </p>
                <a
                  href={SURVEY_URL_EN}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-blue bg-blue text-background-white hover:bg-background-white hover:text-blue mt-5 mb-12 inline-block cursor-pointer rounded-lg border-2 px-8 py-4 text-lg font-bold transition-colors"
                >
                  Take the Survey
                </a>

                <p lang="es" className="mb-5 text-lg leading-normal sm:text-xl">
                  Tome una encuesta sobre su experiencia viajando en Metro para
                  tener la oportunidad de ganar una tarjeta de regalo de $100.
                </p>
                <a
                  href={SURVEY_URL_ES}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-blue bg-blue text-background-white hover:bg-background-white hover:text-blue mt-5 inline-block cursor-pointer rounded-lg border-2 px-8 py-4 text-lg font-bold transition-colors"
                >
                  Tomar encuesta
                </a>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
