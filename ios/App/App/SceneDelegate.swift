import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeVC = ViewController()
        window?.rootViewController = bridgeVC
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        AppDelegate.shared?.showPrivacyProtectionCurtain()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        AppDelegate.shared?.hidePrivacyProtectionCurtain()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        AppDelegate.shared?.showPrivacyProtectionCurtain()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        // Handled in sceneDidBecomeActive
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
