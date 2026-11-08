/**
 * Self-contained support link. Do not load the provider's third-party widget
 * script or override document.write: the button must work offline until clicked.
 */
export default function BuyMeACoffeeButton() {
  return (
    <div className="bmc-btn-container">
      <a
        className="bmc-btn"
        href="https://www.buymeacoffee.com/steveharris"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy me a coffee (opens external website)"
      >
        <span className="bmc-btn-emoji" aria-hidden="true">☕</span>
        <span className="bmc-btn-text">Buy me a coffee</span>
      </a>
    </div>
  );
}
