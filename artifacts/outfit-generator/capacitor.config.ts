import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitalcloset.app',
  appName: 'My Closet',
  webDir: 'dist/public',

  // -------------------------------------------------------------------------
  // iOS-specific configuration
  // -------------------------------------------------------------------------
  ios: {
    // Allow the WKWebView to scroll; the app manages its own scroll areas
    scrollEnabled: true,
    // Prevents white flash on launch
    backgroundColor: '#F4D6DD',
    // Allow inline media playback (used for wardrobe image previews)
    allowsInlineMediaPlayback: true,
    // Export compliance — app uses only standard HTTPS; no custom encryption
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Required for camera access — missing key causes crash on iOS/iPadOS
      NSCameraUsageDescription: "My Digital Closet uses the camera so you can photograph clothing items to add to your wardrobe.",
      // Required for photo library access (read)
      NSPhotoLibraryUsageDescription: "My Digital Closet accesses your photo library so you can upload clothing photos to your wardrobe.",
      // Required for photo library write access — Capacitor Camera saves captured photos to the library
      NSPhotoLibraryAddUsageDescription: "My Digital Closet saves clothing photos to your photo library.",
    },
  },

  plugins: {
    // Keep the splash screen visible until the React app signals it is ready
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#F4D6DD',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },

    // Overlay the status bar so the cream background shows through the notch
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F4D6DD',
      overlaysWebView: true,
    },
  },
};

export default config;
