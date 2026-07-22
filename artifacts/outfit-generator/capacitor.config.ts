import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitalvanity.app',
  appName: 'My Vanity',
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

    // Privacy usage descriptions — all three are required for the camera/photo
    // picker flow.  Missing any one causes a TCC SIGABRT or silent refusal.
    infoPlist: {
      NSCameraUsageDescription:
        'My Digital Vanity needs camera access so you can photograph clothing and accessories to add to your wardrobe.',
      NSPhotoLibraryUsageDescription:
        'My Digital Vanity needs access to your photo library so you can choose existing photos of your clothing and accessories.',
      NSPhotoLibraryAddUsageDescription:
        'My Digital Vanity saves photos you take with the camera to your library so you can access them later.',
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
