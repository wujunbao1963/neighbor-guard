//
//  LoginView.swift
//  NeighborGuard
//
//  Login Screen - Email Entry
//

import SwiftUI

struct LoginView: View {
    @ObservedObject var viewModel: AuthViewModel
    @State private var email = ""
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 24) {
                Spacer()
                
                // Logo
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.white)
                        .frame(width: 80, height: 80)
                        .shadow(color: .black.opacity(0.2), radius: 20, x: 0, y: 10)
                    
                    Text("🛡️")
                        .font(.system(size: 40))
                }
                
                VStack(spacing: 8) {
                    Text("NeighborGuard")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                    
                    Text("Community Watch")
                        .font(.system(size: 16))
                        .foregroundColor(.white.opacity(0.8))
                }
                
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.top, 48)
            .padding(.bottom, 32)
            .background(LinearGradient.ngHeader)
            
            // Form
            VStack(alignment: .leading, spacing: 24) {
                Text("Welcome Back")
                    .font(.system(size: 20, weight: .semibold))
                
                Text("Enter your email to receive a verification code")
                    .font(.system(size: 14))
                    .foregroundColor(.textSecondary)
                
                // Email Input
                HStack(spacing: 12) {
                    Text("📧")
                        .font(.system(size: 18))
                    
                    TextField("your@email.com", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .disabled(viewModel.isLoading)
                }
                .padding(16)
                .background(Color.white)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.border, lineWidth: 1)
                )
                
                // Error Message
                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundColor(.severityHigh)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.severityHigh.opacity(0.1))
                        .cornerRadius(8)
                }
                
                // Submit Button
                Button {
                    Task {
                        await viewModel.requestCode(email: email)
                    }
                } label: {
                    HStack {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Get Verification Code")
                            Image(systemName: "arrow.right")
                        }
                    }
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.ngPurple)
                    .cornerRadius(8)
                }
                .disabled(email.isEmpty || viewModel.isLoading)
                .opacity(email.isEmpty ? 0.6 : 1)
                
                Spacer()
                
                // Dev hint
                VStack(alignment: .leading, spacing: 4) {
                    Text("🧪 Test Mode")
                        .font(.system(size: 12, weight: .medium))
                    Text("Use any email address")
                        .font(.system(size: 12))
                    Text("Verification code: \(AppConfig.testVerificationCode)")
                        .font(.system(size: 12))
                }
                .foregroundColor(.textSecondary)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.pageBackground)
                .cornerRadius(8)
            }
            .padding(24)
            .background(
                Color.white
                    .cornerRadius(24, corners: [.topLeft, .topRight])
                    .shadow(color: .black.opacity(0.1), radius: 20, x: 0, y: -10)
            )
        }
        .background(LinearGradient.ngHeader)
        .ignoresSafeArea()
    }
}

extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners
    
    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}

#Preview {
    LoginView(viewModel: AuthViewModel())
}
