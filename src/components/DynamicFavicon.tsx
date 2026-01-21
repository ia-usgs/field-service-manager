import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import defaultLogo from "@/assets/logo.png";

/**
 * Component that dynamically updates the favicon based on the company logo in settings.
 * Must be mounted in the app root to take effect.
 */
export function DynamicFavicon() {
  const { settings } = useStore();

  useEffect(() => {
    const updateFavicon = () => {
      const logoSrc = settings?.companyLogo || defaultLogo;
      
      // Find or create favicon link element
      let link: HTMLLinkElement | null = document.querySelector("link[rel='icon']");
      
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        document.head.appendChild(link);
      }
      
      link.href = logoSrc;
      
      // Also update OG and Twitter meta images if they exist
      const ogImage = document.querySelector("meta[property='og:image']") as HTMLMetaElement;
      const twitterImage = document.querySelector("meta[name='twitter:image']") as HTMLMetaElement;
      
      if (ogImage) ogImage.content = logoSrc;
      if (twitterImage) twitterImage.content = logoSrc;
    };

    updateFavicon();
  }, [settings?.companyLogo]);

  // Also update the document title based on company name
  useEffect(() => {
    if (settings?.companyName) {
      document.title = settings.companyName;
      
      // Update OG title
      const ogTitle = document.querySelector("meta[property='og:title']") as HTMLMetaElement;
      if (ogTitle) ogTitle.content = settings.companyName;
    }
  }, [settings?.companyName]);

  return null;
}
