import type { SavedActivity, TripList } from './schema';

/**
 * Share a Trip List with multiple activities
 * @param list The trip list to share
 * @param activities Array of activities in the list
 */
export async function shareListCard(
  list: TripList,
  activities: SavedActivity[]
): Promise<void> {
  console.log('📤 [Share List] Starting share function...');
  console.log('📤 [Share List] List:', list.name, 'Activities:', activities.length);
  
  // Prepare share text with list intro
  let shareText = `🎉 Check out my trip plan from FunFinder!\n\n`;
  shareText += `📋 **${list.name}**\n`;
  
  if (list.location) {
    shareText += `📍 Location: ${list.location}\n`;
  }
  
  shareText += `✨ ${activities.length} ${activities.length === 1 ? 'Activity' : 'Activities'}\n\n`;
  shareText += `━━━━━━━━━━━━━━━━\n\n`;
  
  // Add each activity
  activities.forEach((activity, index) => {
    shareText += `${index + 1}. **${activity.title}**\n`;
    
    if (activity.category) {
      shareText += `   🏷️ ${activity.category}`;
    }
    
    if (activity.duration_hours) {
      shareText += ` • ⏱️ ${activity.duration_hours}h`;
    }
    
    if (activity.free !== undefined && activity.free !== null) {
      shareText += ` • ${activity.free ? '💰 Free' : '💳 Paid'}`;
    }
    
    shareText += `\n`;
    
    if (activity.address) {
      shareText += `   📍 ${activity.address}\n`;
    }
    
    if (activity.booking_url) {
      shareText += `   🔗 ${activity.booking_url}\n`;
    }
    
    shareText += `\n`;
  });
  
  shareText += `━━━━━━━━━━━━━━━━\n\n`;
  shareText += `✨ Created with FunFinder - Your family activity planner`;

  // Check if we're in a secure context
  const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  
  if (!isSecure && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    // iOS over HTTP - Web Share API won't work
    console.warn('⚠️ [Share List] iOS detected with HTTP - Web Share API not available in insecure context');
    
    // Try to copy to clipboard instead
    try {
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
        alert('✅ Trip plan copied!\n\nYour trip plan has been copied to your clipboard. You can now paste and share it in any app (WhatsApp, Messages, etc.).\n\n💡 Tip: To enable direct sharing, access the app via HTTPS.');
        return;
      }
    } catch (clipboardError) {
      console.error('❌ [Share List] Clipboard copy failed:', clipboardError);
    }
    
    alert('📋 Share your trip plan:\n\n' + shareText + '\n\n💡 To enable direct sharing from your iPhone, the app needs to be accessed via HTTPS (not HTTP).');
    return;
  }

  // Try text-only share first if Web Share API is available
  if (navigator.share && isSecure) {
    try {
      console.log('📤 [Share List] Attempting text share...');
      await navigator.share({
        title: `${list.name} - FunFinder Trip Plan`,
        text: shareText
      });
      console.log('✅ [Share List] Text share successful!');
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('🚫 [Share List] Share cancelled by user');
        return;
      }
      console.log('⚠️ [Share List] Text share failed:', error);
    }
  }
  
  // Final fallback: try clipboard
  try {
    console.log('📤 [Share List] Attempting clipboard fallback...');
    
    if (navigator.clipboard && isSecure) {
      await navigator.clipboard.writeText(shareText);
      alert('✅ Trip plan copied!\n\nYour trip plan has been copied to your clipboard.\n\nYou can now paste and share it in any app!');
    } else {
      // Try execCommand as fallback (works on iOS without secure context)
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
        alert('✅ Trip plan copied!\n\nYour trip plan has been copied to your clipboard.\n\nYou can now paste and share it in any app!');
      } else {
        alert('📋 Your trip plan:\n\n' + shareText + '\n\nYou can copy this text and paste it into any app to share.');
      }
    }
  } catch (finalError) {
    console.error('❌ [Share List] All sharing methods failed:', finalError);
    alert('📋 Your trip plan:\n\n' + shareText + '\n\nYou can copy this text and paste it into any app to share.');
  }
}

/**
 * Check if sharing is supported on this device
 */
export function isSharingSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  
  // Check for mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  if (isMobile) {
    if ('share' in navigator) return true;
    if ('clipboard' in navigator) return true;
    return true; // Always show on mobile
  }
  
  // Desktop: only show if share API or clipboard is available
  return ('share' in navigator) || ('clipboard' in navigator);
}

