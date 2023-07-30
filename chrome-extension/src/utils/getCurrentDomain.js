export function getCleanUrl(uri) {
    // Remove prefixes (http, https, www, etc.)
    const currentURL = uri.replace(/^(https?|ftp):\/\//i, "").replace(/^www\./i, "");

    // Remove query and path parameters
    const parts = currentURL.split(/[?;]/);

    const hostname = parts.shift() || '';
    const path = (parts.shift() || '').split(';')[0];

    // Combine the hostname and path to form the cleaned URL
    let cleanedUrl = `${hostname}/${path}`;

    // Remove trailing slash if present
    return cleanedUrl.endsWith('/') ? cleanedUrl.slice(0, -1) : cleanedUrl;
}
