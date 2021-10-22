# SafePKT Verifier Extension for Visual Studio Code

This project is implemented in the context of the European NGI LEDGER program.

This prototype aims at bringing more automation
to the field of software verification tools targeting rust-based programs.

See [SafePKT description](https://ledgerproject.github.io/home/#/teams/SafePKT)

## Features

Rust-based smart contract Task-based verification for VS Code editor.

## Requirements

The pathSafePKT verifier binary has to be downloaded,
and this extension should be configured to point at its readable absolute path.

```
wget https://github.com/LedgerProject/safepkt_backend/releases/download/safepkt-backend-v0.2.2/safepkt-cli-v0.2.2-linux -O /usr/local/bin/safepkt-cli 
```

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `safePKTSmartContractVerifier.verifier`: ["/usr/local/bin/verify"]

# Acknowledgment

We're very grateful towards the following organizations, projects and people:
 - the Project Oak maintainers for making [Rust Verifications Tools](https://project-oak.github.io/rust-verification-tools/), a dual-licensed open-source project (MIT / Apache).  
 The RVT tools allowed us to integrate with industrial-grade verification tools in a very effective way. 
 - the KLEE Symbolic Execution Engine maintainers
 - the Rust community at large
 - All members of the NGI-Ledger Consortium for accompanying us  
 [![Blumorpho](../main/img/blumorpho-logo.png?raw=true)](https://www.blumorpho.com/) [![Dyne](../main/img/dyne-logo.png?raw=true)](https://www.dyne.org/ledger/) [![FundingBox](../main/img/funding-box-logo.png?raw=true)](https://fundingbox.com/) [![NGI LEDGER](../main/img/ledger-eu-logo.png?raw=true)](https://ledger-3rd-open-call.fundingbox.com/)

# License

This project is distributed under either the [MIT](../../blob/main/LICENSE-MIT) license or the [Apache](../../blob/main/LICENSE-APACHE) License.
