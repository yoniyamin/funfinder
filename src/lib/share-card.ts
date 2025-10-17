import html2canvas from 'html2canvas';
import type { Activity } from './schema';

/**
 * Share an Activity card as an image with text
 * @param activity The activity to share
 * @param cardElement The DOM element of the card to capture
 * @param location Optional location context for the share text
 */
export async function shareActivityCard(
  activity: Activity,
  cardElement: HTMLElement,
  location?: string
): Promise<void> {
  console.log('📤 [Share] Starting share function...');
  console.log('📤 [Share] navigator.share available?', 'share' in navigator);
  console.log('📤 [Share] window.isSecureContext?', window.isSecureContext);
  console.log('📤 [Share] protocol:', window.location.protocol);
  
  // Prepare share text first (used by all methods)
  let shareText = `Check out this activity I found on FunFinder! 🎉\n\n📍 ${activity.title || 'Amazing Activity'}${location ? ` in ${location}` : ''}\n\n${activity.description ? activity.description.substring(0, 150) + (activity.description.length > 150 ? '...' : '') : 'Find more family-friendly activities!'}`;
  
  // Add booking link if available
  if (activity.booking_url) {
    shareText += `\n\n🔗 More info: ${activity.booking_url}`;
  }
  
  shareText += `\n\n✨ Discover more on FunFinder`;

  // Check if we're in a secure context
  const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  
  if (!isSecure && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    // iOS over HTTP - Web Share API won't work
    console.warn('⚠️ [Share] iOS detected with HTTP - Web Share API not available in insecure context');
    
    // Try to copy to clipboard instead
    try {
      // Create a textarea to copy text
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      // Select and copy
      textarea.select();
      textarea.setSelectionRange(0, 99999); // For mobile devices
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        alert('✅ Activity details copied!\n\nThe activity details with the link have been copied to your clipboard. You can now paste and share it in any app (WhatsApp, Messages, etc.).\n\n💡 Tip: To enable direct sharing, access the app via HTTPS.');
        return;
      }
    } catch (clipboardError) {
      console.error('❌ [Share] Clipboard copy failed:', clipboardError);
    }
    
    // Last resort: Show the text in an alert so user can manually copy it
    alert('📋 Share this activity:\n\n' + shareText + '\n\n💡 To enable direct sharing from your iPhone, the app needs to be accessed via HTTPS (not HTTP).');
    return;
  }

  // Try text-only share first if Web Share API is available (faster, more reliable)
  if (navigator.share && isSecure) {
    try {
      console.log('📤 [Share] Attempting text-only share...');
      await navigator.share({
        title: `${activity.title || 'Activity'} - FunFinder`,
        text: shareText
      });
      console.log('✅ [Share] Text share successful!');
      return; // Success! Exit early
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled - this is normal
        console.log('🚫 [Share] Share cancelled by user');
        return;
      }
      // If text share failed, try with image below
      console.log('⚠️ [Share] Text share failed, attempting image share...', error);
    }
  }

  // If text share failed or wasn't available, try image share
  try {

    // Create a clone of the card element to modify for sharing
    const clone = cardElement.cloneNode(true) as HTMLElement;
    
    // Style the clone for better image capture with fixed dimensions
    const cardWidth = Math.max(cardElement.offsetWidth, 350);
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${cardWidth}px`;
    clone.style.minHeight = '400px';
    clone.style.backgroundColor = 'white';
    clone.style.borderRadius = '16px';
    clone.style.padding = '20px';
    clone.style.boxSizing = 'border-box';
    clone.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // Ensure all text elements have proper styling
    const allTextElements = clone.querySelectorAll('*');
    allTextElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style) {
        // Force visibility and text rendering
        htmlEl.style.visibility = 'visible';
        htmlEl.style.opacity = '1';
      }
    });
    
    // Fix chip/tag alignment
    const chips = clone.querySelectorAll('.chip, [class*="chip"]');
    chips.forEach((chip) => {
      const chipEl = chip as HTMLElement;
      if (chipEl.style) {
        chipEl.style.display = 'inline-flex';
        chipEl.style.alignItems = 'center';
        chipEl.style.justifyContent = 'center';
        chipEl.style.textAlign = 'center';
      }
    });
    
    // Remove the share button and exclude button from the clone
    const shareBtn = clone.querySelector('[data-share-btn]');
    const excludeBtn = clone.querySelector('button[title*="suggest"]');
    const evidenceSection = clone.querySelector('.text-\\[11px\\]');
    if (shareBtn) shareBtn.remove();
    if (excludeBtn) excludeBtn.remove();
    if (evidenceSection) evidenceSection.remove(); // Remove evidence sources from image
    
    // Add watermark to the clone (simple text with search icon)
    const watermark = document.createElement('div');
    watermark.style.cssText = `
      position: absolute;
      bottom: 12px;
      right: 16px;
      font-size: 12px;
      font-weight: 600;
      color: rgba(147, 51, 234, 0.7);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 5px;
    `;
    // Create search icon SVG
    const searchIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(147, 51, 234, 0.7)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`;
    watermark.innerHTML = `${searchIcon} <span>FunFinder</span>`;
    clone.appendChild(watermark);
    
    // Append clone to body temporarily
    document.body.appendChild(clone);
    
    try {
      // Capture the card as an image with optimized settings
      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: cardWidth,
        width: cardWidth,
        height: clone.scrollHeight,
        // Force text rendering
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.body.querySelector('[id^="activity-card-"]');
          if (clonedElement) {
            // Ensure fonts are loaded
            (clonedElement as HTMLElement).style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
          }
        }
      });
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create image'));
        }, 'image/png', 0.95);
      });
      
      // Create File from blob
      const file = new File([blob], `funfinder-${activity.title?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'activity'}.png`, {
        type: 'image/png'
      });
      
      const shareData: ShareData = {
        title: `${activity.title || 'Activity'} - FunFinder`,
        text: shareText,
        files: [file]
      };
      
      // Try to share with image
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          return; // Success!
        } catch (shareError) {
          console.log('Image share with text failed:', shareError);
          // Continue to fallback below
        }
      }
      
    } finally {
      // Clean up: remove clone
      if (clone && clone.parentNode) {
        document.body.removeChild(clone);
      }
    }
    
  } catch (error) {
    console.error('Error during image generation:', error);
    // Continue to text fallback below
  }
  
  // Final fallback: try text-only share or clipboard
  try {
    console.log('📤 [Share] Attempting final fallback...');
    
    if (navigator.share && isSecure) {
      console.log('📤 [Share] Trying navigator.share fallback...');
      await navigator.share({
        title: `${activity.title || 'Activity'} - FunFinder`,
        text: shareText
      });
      console.log('✅ [Share] Fallback share successful!');
    } else {
      // Try clipboard with execCommand (works on iOS without secure context)
      console.log('📤 [Share] Trying clipboard fallback...');
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      textarea.select();
      textarea.setSelectionRange(0, 99999);
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        alert('✅ Activity details copied!\n\nThe activity details (including the link) have been copied to your clipboard.\n\nYou can now paste and share it in any app!');
      } else {
        // Show text in alert as absolute last resort
        alert('📋 Share this activity:\n\n' + shareText);
      }
    }
  } catch (finalError) {
    if ((finalError as Error).name === 'AbortError') {
      console.log('🚫 [Share] Share cancelled by user');
      return;
    }
    console.error('❌ [Share] All sharing methods failed:', finalError);
    
    // Absolute last resort: show in alert
    alert('📋 Activity details:\n\n' + shareText + '\n\nYou can copy this text and paste it into any app to share.');
  }
}

/**
 * Check if sharing is supported on this device
 */
export function isSharingSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  
  // Check for mobile device - always show on mobile for better UX
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  if (isMobile) {
    // On mobile, always show the button if we have any sharing capability
    // Check for Web Share API
    if ('share' in navigator) return true;
    // Check for clipboard API as fallback
    if ('clipboard' in navigator) return true;
    // Show button on mobile anyway - worst case we'll show an error message
    return true;
  }
  
  // Desktop: only show if share API or clipboard is available
  return ('share' in navigator) || ('clipboard' in navigator);
}

