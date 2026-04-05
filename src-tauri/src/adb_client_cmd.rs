use adb_client::{ADBDeviceExt, ADBMessageTransport, ADBTcpDevice, ADBTransport};
use std::net::SocketAddr;
use adb_client::device::{MessageCommand, ADBTransportMessage};

static mut device: Option<ADBTcpDevice> = None;

#[tauri::command]
pub fn connect(ip: String) -> Result<String, String> {
    let parsed_ip: SocketAddr = match ip.parse() {
        Ok(addr) => addr,
        Err(_) => return Err("Failed to parse IP address".to_string()),
    };
    let device_ = match ADBTcpDevice::new(parsed_ip) {
        Ok(dev) => Some(dev),
        Err(e) => return Err(format!("Failed to connect to device: {}", e)),
    };
    unsafe {
        device = device_;
    }

    Ok("Connected to device".to_string())
}

#[tauri::command]
pub fn shell(command: String) -> String {
    if unsafe { device.is_none() } {
        return "Device is not connected".to_string();
    }
    let device_ = unsafe { device.as_mut().unwrap() };
    let mut output = Vec::new();
    if let Err(e) = device_.shell_command(&[command.as_str()], &mut output) {
        return format!("Error: {}", e);
    }

    return String::from_utf8(output).unwrap();
}

#[tauri::command]
pub fn push(file_data: Vec<u8>, destination_path: String) -> Result<String, String> {
    if unsafe { device.is_none() } {
        return Err("Device is not connected".to_string())
    }
    let device_ = unsafe { device.as_mut().unwrap() };
    
    match device_.push(&mut &file_data[..], &destination_path) {
        Ok(_) => Ok("File pushed successfully".to_string()),
        Err(e) => Err(format!("Failed to push file: {}", e)),
    }
}

#[tauri::command]
pub fn run_daemon_command(command: String) -> Result<String, String> {
    if unsafe { device.is_none() } {
        return Err("Device is not connected".to_string());
    }
    let device_ = unsafe { device.as_mut().unwrap() };
    let res = device_.inner_mut().open_session(command.as_bytes()).map_err(|e| format!("Failed to open session: {}", e))?;
    if res.header().command() != MessageCommand::Okay {
        return Err(format!("Failed to run command: {}", res.header().command()));
    }

    let mut output = Vec::new();

    loop {
        let response = device_.inner_mut().get_transport_mut().read_message().expect("Failed to read message");
        if response.header().command() != MessageCommand::Write {
            break Ok(String::from_utf8_lossy(&output).to_string());
        } else {
            output.extend_from_slice(response.payload());
            device_.inner_mut().get_transport_mut().write_message(ADBTransportMessage::new(
                MessageCommand::Okay,
                response.header().arg1(),
                response.header().arg0(),
                &[],
            ));
        }
    }
}

#[tauri::command]
pub fn disconnect() -> Result<String, String> {
    if unsafe { device.is_none() } {
        return Err("Device is not connected".to_string());
    }
    let device_ = unsafe { device.as_mut().unwrap() };
    device_.inner_mut().get_transport_mut().disconnect().expect("Failed to disconnect from device");
    unsafe {
        device = None;
    }

    Ok("Disconnected from device".to_string())
}