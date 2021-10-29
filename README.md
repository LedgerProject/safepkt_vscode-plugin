# SafePKT Verifier Extension for Visual Studio Code

This project is implemented in the context of the European NGI LEDGER program.

This prototype aims at bringing more automation
to the field of software verification tools targeting rust-based programs.

See [SafePKT description](https://ledgerproject.github.io/home/#/teams/SafePKT)

## Features

Rust-based smart contract Task-based verification for VS Code editor.

## Requirements

The extension should be able to send HTTP requests to SafePKT backend.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `safePKTSmartContractVerifier.backend`: ["https://vinny.cjdns.fr"]

This value is an array, which can possibly contain as a single string value
 - an HTTP or HTTPS protocol scheme ("https://")  
 - a host name ("vinny.cjdns.fr")  
 - a base path ("" empty by default)  

resulting in the default value "https://vinny.cjdns.fr"

# Acknowledgment

We're very grateful towards the following organizations, projects and people:
 - the Project Oak maintainers for making [Rust Verifications Tools](https://project-oak.github.io/rust-verification-tools/), a dual-licensed open-source project (MIT / Apache).  
 The RVT tools allowed us to integrate with industrial-grade verification tools in a very effective way. 
 - the KLEE Symbolic Execution Engine maintainers
 - Tree-sitter, a parser generator tool and an incremental parsing library 
 - the Rust community at large
 - All members of the NGI-Ledger Consortium for accompanying us  
 [![Blumorpho](../main/img/blumorpho-logo.png?raw=true)](https://www.blumorpho.com/) [![Dyne](../main/img/dyne-logo.png?raw=true)](https://www.dyne.org/ledger/) [![FundingBox](../main/img/funding-box-logo.png?raw=true)](https://fundingbox.com/) [![NGI LEDGER](../main/img/ledger-eu-logo.png?raw=true)](https://ledger-3rd-open-call.fundingbox.com/)

# License

This project is distributed under either the [MIT](../../blob/main/LICENSE-MIT) license or the [Apache](../../blob/main/LICENSE-APACHE) License.
