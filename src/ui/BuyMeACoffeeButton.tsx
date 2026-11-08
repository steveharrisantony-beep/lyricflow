import { useEffect, useRef } from 'react';

const BMC_SCRIPT_SRC = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';
const BMC_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Comic+Neue:wght@700&display=swap';

export default function BuyMeACoffeeButton() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof document === 'undefined') return;

    // Guard document.writeln / document.write so the legacy BMC script cannot wipe the SPA DOM.
    const origWriteln = document.writeln;
    const origWrite = document.write;
    document.writeln = () => {};
    document.write = () => {};

    if (!document.querySelector(`link[href="${BMC_FONT_HREF}"]`)) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = BMC_FONT_HREF;
      document.head.appendChild(fontLink);
    }

    if (!container.querySelector(`script[src="${BMC_SCRIPT_SRC}"]`)) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = BMC_SCRIPT_SRC;
      script.async = true;
      script.setAttribute('data-name', 'bmc-button');
      script.setAttribute('data-slug', 'steveharris');
      script.setAttribute('data-color', '#FFDD00');
      script.setAttribute('data-emoji', '☕');
      script.setAttribute('data-font', 'Comic');
      script.setAttribute('data-text', 'Buy me a coffee');
      script.setAttribute('data-outline-color', '#000000');
      script.setAttribute('data-font-color', '#000000');
      script.setAttribute('data-coffee-color', '#ffffff');
      container.appendChild(script);
    }

    return () => {
      document.writeln = origWriteln;
      document.write = origWrite;
    };
  }, []);

  return (
    <div ref={containerRef} className="bmc-btn-container">
      <a
        className="bmc-btn"
        href="https://www.buymeacoffee.com/steveharris"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy me a coffee"
        data-name="bmc-button"
        data-slug="steveharris"
        data-color="#FFDD00"
        data-emoji="☕"
        data-font="Comic"
        data-text="Buy me a coffee"
        data-outline-color="#000000"
        data-font-color="#000000"
        data-coffee-color="#ffffff"
      >
        <span className="bmc-btn-emoji" aria-hidden="true">
          ☕
        </span>
        <span className="bmc-btn-text">Buy me a coffee</span>
      </a>
    </div>
  );
}
