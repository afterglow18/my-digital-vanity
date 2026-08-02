import UIKit
import Capacitor

/// Custom bridge view controller that registers local plugins.
/// The storyboard's "Capacitor view controller" scene uses this class
/// as its custom class so Capacitor invokes capacitorDidLoad() on launch.
class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoCleanupPlugin())
        bridge?.registerPluginInstance(VisionPlugin())
    }
}
