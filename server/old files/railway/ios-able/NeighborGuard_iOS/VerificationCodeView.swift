//
//  VerificationCodeView.swift
//  NeighborGuard
//
//  Verification Code Entry Screen
//

import SwiftUI

struct VerificationCodeView: View {
    @ObservedObject var viewModel: AuthViewModel
    @State private var code = ""
    @State private var countdown = 60
    @State private var timer: Timer?
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 24) {
                Spacer()
                
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
                Text("Enter Verification Code")
                    .font(.system(size: 20, weight: .semibold))
                
                Text("Code sent to **\(viewModel.currentEmail)**")
                    .font(.system(size: 14))
                    .foregroundColor(.textSecondary)
                
                // Code Input
                HStack(spacing: 12) {
                    Text("🔑")
                        .font(.system(size: 18))
                    
                    TextField("6-digit code", text: $code)
                        .keyboardType(.numberPad)
                        .font(.system(size: 24, weight: .medium, design: .monospaced))
                        .multilineTextAlignment(.center)
                        .onChange(of: code) { oldValue, newValue in
                            code = String(newValue.filter { $0.isNumber }.prefix(6))
                            if code.count == 6 {
                                Task {
                                    await viewModel.login(code: code)
                                }
                            }
                        }
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
                
                // Login Button
                Button {
                    Task {
                        await viewModel.login(code: code)
                    }
                } label: {
                    HStack {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Login")
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
                .disabled(code.count != 6 || viewModel.isLoading)
                .opacity(code.count != 6 ? 0.6 : 1)
                
                // Actions
                HStack {
                    Button {
                        viewModel.goBackToEmail()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.left")
                            Text("Change Email")
                        }
                        .font(.system(size: 14))
                        .foregroundColor(.textSecondary)
                    }
                    
                    Spacer()
                    
                    Button {
                        Task {
                            await viewModel.requestCode(email: viewModel.currentEmail)
                            countdown = 60
                            startTimer()
                        }
                    } label: {
                        Text(countdown > 0 ? "Resend in \(countdown)s" : "Resend Code")
                            .font(.system(size: 14))
                            .foregroundColor(countdown > 0 ? .textMuted : .ngPurple)
                    }
                    .disabled(countdown > 0 || viewModel.isLoading)
                }
                
                Spacer()
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
        .onAppear {
            startTimer()
        }
        .onDisappear {
            timer?.invalidate()
        }
    }
    
    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if countdown > 0 {
                countdown -= 1
            } else {
                timer?.invalidate()
            }
        }
    }
}

#Preview {
    VerificationCodeView(viewModel: AuthViewModel())
}
