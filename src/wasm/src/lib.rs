use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn calculate_magnitude(values: &[f64]) -> f64 {
    let mut sum = 0.0;
    for &v in values {
        sum += v * v;
    }
    sum.sqrt()
}

#[wasm_bindgen]
pub fn calculate_dot_product(
    keys_a: &[i32], values_a: &[f64],
    keys_b: &[i32], values_b: &[f64]
) -> f64 {
    let mut i = 0;
    let mut j = 0;
    let mut dot = 0.0;
    while i < keys_a.len() && j < keys_b.len() {
        if keys_a[i] == keys_b[j] {
            dot += values_a[i] * values_b[j];
            i += 1;
            j += 1;
        } else if keys_a[i] < keys_b[j] {
            i += 1;
        } else {
            j += 1;
        }
    }
    dot
}

#[wasm_bindgen]
pub fn intersection_size(keys_a: &[i32], keys_b: &[i32]) -> usize {
    let mut i = 0;
    let mut j = 0;
    let mut count = 0;
    while i < keys_a.len() && j < keys_b.len() {
        if keys_a[i] == keys_b[j] {
            count += 1;
            i += 1;
            j += 1;
        } else if keys_a[i] < keys_b[j] {
            i += 1;
        } else {
            j += 1;
        }
    }
    count
}

#[wasm_bindgen]
pub fn cosine_similarity(
    keys_a: &[i32], values_a: &[f64],
    keys_b: &[i32], values_b: &[f64],
    min_intersection: usize
) -> f64 {
    let mut i = 0;
    let mut j = 0;
    let mut dot = 0.0;
    let mut intersection = 0;
    while i < keys_a.len() && j < keys_b.len() {
        if keys_a[i] == keys_b[j] {
            dot += values_a[i] * values_b[j];
            intersection += 1;
            i += 1;
            j += 1;
        } else if keys_a[i] < keys_b[j] {
            i += 1;
        } else {
            j += 1;
        }
    }
    if intersection < min_intersection {
        return 0.0;
    }
    let mag_a = calculate_magnitude(values_a);
    let mag_b = calculate_magnitude(values_b);
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}

#[wasm_bindgen]
pub fn jaccard_similarity(
    keys_a: &[i32],
    keys_b: &[i32],
    min_intersection: usize
) -> f64 {
    let intersect = intersection_size(keys_a, keys_b);
    if intersect < min_intersection {
        return 0.0;
    }
    let union_size = keys_a.len() + keys_b.len() - intersect;
    if union_size == 0 {
        return 0.0;
    }
    intersect as f64 / union_size as f64
}

#[wasm_bindgen]
pub fn pearson_correlation(
    keys_a: &[i32], values_a: &[f64],
    keys_b: &[i32], values_b: &[f64],
    min_intersection: usize
) -> f64 {
    if keys_a.is_empty() || keys_b.is_empty() {
        return 0.0;
    }

    let mut i = 0;
    let mut j = 0;
    let mut intersection = 0;
    while i < keys_a.len() && j < keys_b.len() {
        if keys_a[i] == keys_b[j] {
            intersection += 1;
            i += 1;
            j += 1;
        } else if keys_a[i] < keys_b[j] {
            i += 1;
        } else {
            j += 1;
        }
    }
    if intersection < min_intersection {
        return 0.0;
    }

    let sum_a: f64 = values_a.iter().sum();
    let mean_a = sum_a / (values_a.len() as f64);

    let sum_b: f64 = values_b.iter().sum();
    let mean_b = sum_b / (values_b.len() as f64);

    let mut sum_sq_a = 0.0;
    for &v in values_a {
        let diff = v - mean_a;
        sum_sq_a += diff * diff;
    }
    let mag_a = sum_sq_a.sqrt();

    let mut sum_sq_b = 0.0;
    for &v in values_b {
        let diff = v - mean_b;
        sum_sq_b += diff * diff;
    }
    let mag_b = sum_sq_b.sqrt();

    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }

    let mut i = 0;
    let mut j = 0;
    let mut dot = 0.0;
    while i < keys_a.len() && j < keys_b.len() {
        if keys_a[i] == keys_b[j] {
            dot += (values_a[i] - mean_a) * (values_b[j] - mean_b);
            i += 1;
            j += 1;
        } else if keys_a[i] < keys_b[j] {
            i += 1;
        } else {
            j += 1;
        }
    }

    dot / (mag_a * mag_b)
}
