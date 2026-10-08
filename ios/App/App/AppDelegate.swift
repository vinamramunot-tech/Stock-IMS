import UIKit
import Capacitor
import LocalAuthentication

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    static weak var shared: AppDelegate?
    var window: UIWindow?
    private var privacyCurtainView: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        AppDelegate.shared = self
        DispatchQueue.main.async { [weak self] in
            if let bridgeVC = self?.activeKeyWindow?.rootViewController as? CAPBridgeViewController {
                bridgeVC.bridge?.registerPluginInstance(BiometricAuthPlugin())
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.disableWebViewZoom()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Hide sensitive trade data from the iOS App Switcher screenshot
        showPrivacyProtectionCurtain()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        showPrivacyProtectionCurtain()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Will become active shortly
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        hidePrivacyProtectionCurtain()
        disableWebViewZoom()
    }

    private var activeKeyWindow: UIWindow? {
        if let window = self.window { return window }
        for scene in UIApplication.shared.connectedScenes {
            if let windowScene = scene as? UIWindowScene {
                if let key = windowScene.windows.first(where: { $0.isKeyWindow }) {
                    return key
                }
            }
        }
        return nil
    }

    func showPrivacyProtectionCurtain() {
        guard let window = self.activeKeyWindow else { return }
        if privacyCurtainView != nil { return }

        let curtain = UIView(frame: window.bounds)
        curtain.backgroundColor = UIColor(red: 16/255, green: 16/255, blue: 20/255, alpha: 1.0) // Luxury Stark Black
        curtain.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        curtain.tag = 998877

        let blurEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        let blurView = UIVisualEffectView(effect: blurEffect)
        blurView.frame = curtain.bounds
        blurView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        curtain.addSubview(blurView)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false

        let lockIcon = UIImageView(image: UIImage(systemName: "lock.shield.fill"))
        lockIcon.tintColor = UIColor(red: 212/255, green: 175/255, blue: 55/255, alpha: 1.0) // Gold #d4af37
        lockIcon.contentMode = .scaleAspectFit
        lockIcon.widthAnchor.constraint(equalToConstant: 54).isActive = true
        lockIcon.heightAnchor.constraint(equalToConstant: 54).isActive = true

        let brandLabel = UILabel()
        let brandAttr = NSMutableAttributedString(
            string: "MAVA GEMS",
            attributes: [
                .font: UIFont.systemFont(ofSize: 20, weight: .bold),
                .foregroundColor: UIColor.white,
                .kern: 2.0
            ]
        )
        brandLabel.attributedText = brandAttr

        let subLabel = UILabel()
        let subAttr = NSMutableAttributedString(
            string: "CONFIDENTIAL TRADE VAULT",
            attributes: [
                .font: UIFont.systemFont(ofSize: 11, weight: .semibold),
                .foregroundColor: UIColor(red: 212/255, green: 175/255, blue: 55/255, alpha: 0.9),
                .kern: 1.5
            ]
        )
        subLabel.attributedText = subAttr

        let noteLabel = UILabel()
        noteLabel.text = "Protected by Face ID"
        noteLabel.font = UIFont.systemFont(ofSize: 13, weight: .regular)
        noteLabel.textColor = UIColor(white: 0.7, alpha: 1.0)

        stack.addArrangedSubview(lockIcon)
        stack.addArrangedSubview(brandLabel)
        stack.addArrangedSubview(subLabel)
        stack.addArrangedSubview(noteLabel)

        blurView.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: blurView.contentView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: blurView.contentView.centerYAnchor)
        ])

        window.addSubview(curtain)
        self.privacyCurtainView = curtain
    }

    func hidePrivacyProtectionCurtain() {
        if let curtain = privacyCurtainView {
            UIView.animate(withDuration: 0.2, animations: {
                curtain.alpha = 0
            }) { _ in
                curtain.removeFromSuperview()
                self.privacyCurtainView = nil
            }
        }
    }

    private func disableWebViewZoom() {
        let activeWindow = self.activeKeyWindow
        if let bridgeVC = activeWindow?.rootViewController as? CAPBridgeViewController {
            bridgeVC.webView?.scrollView.minimumZoomScale = 1.0
            bridgeVC.webView?.scrollView.maximumZoomScale = 1.0
            bridgeVC.webView?.scrollView.bouncesZoom = false
            for gesture in bridgeVC.webView?.scrollView.gestureRecognizers ?? [] {
                if let tap = gesture as? UITapGestureRecognizer, tap.numberOfTapsRequired == 2 {
                    tap.isEnabled = false
                }
            }
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// =============================================================================
// ROOT VIEW CONTROLLER WITH NATIVE BIOMETRIC PLUGIN REGISTRATION
// =============================================================================

@objc(ViewController)
public class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(BiometricAuthPlugin())
    }
}

// =============================================================================
// NATIVE BIOMETRIC & FACE ID AUTHENTICATION PLUGIN FOR CAPACITOR
// =============================================================================

@objc(BiometricAuthPlugin)
public class BiometricAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricAuthPlugin"
    public let jsName = "BiometricAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkBiometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enablePrivacyCurtain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disablePrivacyCurtain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFaceIdEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isFaceIdEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc public func checkBiometry(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let canBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        var biometryType = "none"
        if #available(iOS 11.0, *) {
            switch context.biometryType {
            case .faceID:
                biometryType = "faceId"
            case .touchID:
                biometryType = "touchId"
            case .opticID:
                biometryType = "opticId"
            default:
                biometryType = "none"
            }
        }
        let canDevicePasscode = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        call.resolve([
            "isAvailable": canBiometrics || canDevicePasscode,
            "hasBiometrics": canBiometrics,
            "biometryType": biometryType,
            "error": error?.localizedDescription ?? ""
        ])
    }

    @objc public func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Authenticate to access Mava Gems Vault"
        let allowPasscode = call.getBool("allowDeviceCredential") ?? true
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        let policy: LAPolicy = allowPasscode ? .deviceOwnerAuthentication : .deviceOwnerAuthenticationWithBiometrics
        var authError: NSError?

        if context.canEvaluatePolicy(policy, error: &authError) {
            context.evaluatePolicy(policy, localizedReason: reason) { success, evaluateError in
                DispatchQueue.main.async {
                    if success {
                        call.resolve([
                            "authenticated": true
                        ])
                    } else {
                        let code = evaluateError?._code ?? -1
                        let msg = evaluateError?.localizedDescription ?? "Authentication failed"
                        call.reject(msg, "\(code)")
                    }
                }
            }
        } else {
            let code = authError?._code ?? -1
            let msg = authError?.localizedDescription ?? "Biometric authentication not available"
            call.reject(msg, "\(code)")
        }
    }

    @objc public func enablePrivacyCurtain(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AppDelegate.shared?.showPrivacyProtectionCurtain()
            call.resolve(["enabled": true])
        }
    }

    @objc public func disablePrivacyCurtain(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AppDelegate.shared?.hidePrivacyProtectionCurtain()
            call.resolve(["disabled": true])
        }
    }

    @objc public func setFaceIdEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        UserDefaults.standard.set(enabled, forKey: "face_id_enabled")
        call.resolve(["enabled": enabled])
    }

    @objc public func isFaceIdEnabled(_ call: CAPPluginCall) {
        let enabled = UserDefaults.standard.bool(forKey: "face_id_enabled")
        call.resolve(["enabled": enabled])
    }
}
