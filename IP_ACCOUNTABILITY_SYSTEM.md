# IP Accountability System Documentation

## Overview
The IP (Investigational Product) Accountability System provides comprehensive drug dispensing and return tracking with multi-dose compliance calculations. This system ensures accurate audit trails and compliance monitoring for clinical studies.

## Key Features

### 1. **Multi-Dose Compliance Calculations**
The system automatically calculates compliance based on study-specific dosing frequencies:

| Dosing Frequency | Doses Per Day | Example Calculation |
|-----------------|---------------|-------------------|
| QD (Once Daily) | 1 | 7 days × 1 = 7 expected pills |
| BID (Twice Daily) | 2 | 7 days × 2 = 14 expected pills |
| TID (Three Times Daily) | 3 | 7 days × 3 = 21 expected pills |
| QID (Four Times Daily) | 4 | 7 days × 4 = 28 expected pills |
| Weekly | 1/7 (0.143) | 7 days × 0.143 = 1 expected pill |
| Custom | 1 (default) | Extensible for custom protocols |

### 2. **IP Return Linkage System**
Correctly handles drug returns from previous visits:

- **Proper Linkage**: Returns are attached to the original dispensing visit
- **Transactional Integrity**: All operations occur in a single database transaction
- **Audit Trail**: Complete lifecycle tracking from dispensing to return
- **Data Consistency**: Prevents incorrect compliance calculations

### 3. **Inclusive Date Calculations**
Uses proper inclusive date counting for compliance calculations:
```
Expected Doses = (Last Dose Date - First Dose Date + 1) × Doses Per Day
```
This ensures both first and last dose dates are counted.

## Technical Implementation

### Database Schema

#### Enhanced subject_visits Table
```sql
CREATE TABLE subject_visits (
    -- Standard fields
    id UUID PRIMARY KEY,
    subject_id UUID REFERENCES subjects(id),
    visit_name TEXT NOT NULL,
    visit_date DATE NOT NULL,
    status TEXT DEFAULT 'scheduled',
    
    -- IP accountability fields
    study_id UUID REFERENCES studies(id),
    ip_start_date DATE,          -- When first dose was taken  
    ip_last_dose_date DATE,      -- When last dose was taken
    ip_dispensed INTEGER,        -- Pills dispensed at this visit
    ip_returned INTEGER,         -- Pills returned at this visit  
    ip_id TEXT,                  -- Bottle/kit number for this visit
    
    -- Lab kit tracking
    lab_kit_required BOOLEAN,
    accession_number TEXT,
    lab_kit_shipped_date DATE,
    
    -- Other fields...
);
```

#### Enhanced drug_compliance Table  
```sql
CREATE TABLE drug_compliance (
    id UUID PRIMARY KEY,
    subject_id UUID REFERENCES subjects(id),
    ip_id TEXT,                  -- Links to specific bottle/kit
    dispensed_count INTEGER,
    returned_count INTEGER DEFAULT 0,
    expected_taken NUMERIC,      -- Calculated based on study dosing
    
    -- Generated compliance fields
    actual_taken INTEGER GENERATED ALWAYS AS (dispensed_count - returned_count) STORED,
    compliance_percentage NUMERIC GENERATED ALWAYS AS (
        CASE 
            WHEN expected_taken > 0 
            THEN ROUND((actual_taken::NUMERIC / expected_taken) * 100, 1)
            ELSE 0 
        END
    ) STORED,
    
    -- Audit fields
    dispensing_date DATE,        -- Original dispensing date
    ip_last_dose_date DATE,      -- When last dose was taken
    assessment_date DATE,        -- When compliance was assessed
    visit_id UUID REFERENCES subject_visits(id),
    
    -- Ensure one record per bottle per subject
    UNIQUE(subject_id, ip_id)
);
```

### API Endpoints

#### IP Accountability Endpoint
```
PUT /api/subject-visits/[id]/ip-accountability
```

**Request Body:**
```json
{
  "status": "completed",
  "visit_date": "2025-08-31",
  
  // New dispensing at current visit
  "ip_id": "002",
  "ip_dispensed": 50,
  "ip_start_date": "2025-08-31",
  
  // Return from previous visit  
  "return_ip_id": "001",
  "ip_returned": 40,
  "ip_last_dose_date": "2025-08-31"
}
```

**Processing Logic:**
1. Updates current visit with basic fields and new dispensing info
2. Finds previous visit where returned bottle was dispensed
3. Updates previous visit with return information
4. Upserts compliance records for both returned and newly dispensed bottles
5. Calculates compliance using study-specific dosing frequency

### Database Functions

#### save_visit_with_ip_transaction()
PostgreSQL function that handles all IP accountability operations in a single transaction:

- **Input**: Visit data with dispensing and return information
- **Process**: Updates visits, creates/updates compliance records
- **Output**: Success/failure status with detailed summary
- **Features**: Automatic dosing frequency lookup, proper date calculations

#### calculate_drug_compliance_metrics()
Helper function for compliance calculations:

- **Input**: Dispensed count, returned count, dates, dose per day
- **Output**: Actual taken, expected taken, compliance percentage
- **Logic**: Inclusive date counting with multi-dose support

## Compliance Calculation Examples

### Example 1: QD Study (Once Daily)
- **Study**: `dosing_frequency = 'QD'` 
- **Dispensed**: 50 pills on 2025-08-25
- **Returned**: 40 pills on 2025-08-31 (last dose: 2025-08-31)
- **Calculation**: 
  - Days: (2025-08-31 - 2025-08-25 + 1) = 7 days
  - Expected: 7 days × 1 dose/day = 7 pills
  - Actual: 50 - 40 = 10 pills taken
  - Compliance: 10/7 × 100 = 142.9% (over-compliant)

### Example 2: BID Study (Twice Daily)
- **Study**: `dosing_frequency = 'BID'`
- **Same dates and counts as above**
- **Calculation**:
  - Days: 7 days
  - Expected: 7 days × 2 doses/day = 14 pills  
  - Actual: 10 pills taken
  - Compliance: 10/14 × 100 = 71.4% (under-compliant)

### Example 3: Weekly Study
- **Study**: `dosing_frequency = 'weekly'`
- **Dispensed**: 4 pills for 28-day period
- **Returned**: 1 pill after 28 days
- **Calculation**:
  - Days: 28 days
  - Expected: 28 days × (1/7) doses/day = 4 pills
  - Actual: 4 - 1 = 3 pills taken  
  - Compliance: 3/4 × 100 = 75.0% (under-compliant)

## Workflow Examples

### Scenario 1: Simple Dispensing
1. **Visit 1 (Baseline)**: Dispense 30 pills, bottle "001"
2. **System Action**: Creates compliance placeholder for bottle "001"
3. **Result**: Ready for future return processing

### Scenario 2: Return with New Dispensing  
1. **Visit 2**: Return 10 pills from bottle "001", dispense 30 pills as bottle "002"
2. **System Actions**:
   - Updates Visit 1 (Baseline) with `ip_returned: 10` 
   - Updates compliance for bottle "001" with return info
   - Updates Visit 2 with new dispensing info for bottle "002"
   - Creates compliance placeholder for bottle "002"
3. **Result**: Proper audit trail with separate compliance tracking per bottle

### Scenario 3: Multi-Dose Study
1. **BID Study Setup**: `studies.dosing_frequency = 'BID'`
2. **Visit Processing**: Same as above scenarios
3. **Compliance Calculation**: Automatically uses 2 doses per day
4. **Result**: Accurate compliance for multi-dose protocols

## Error Handling

### Common Errors and Solutions

1. **"No prior visit found for bottle ID"**
   - **Cause**: Trying to return a bottle that was never dispensed
   - **Solution**: Verify bottle ID or create dispensing record first

2. **"NULL constraint violation"**  
   - **Cause**: Missing required fields in database
   - **Solution**: Ensure all NOT NULL fields have values

3. **"Failed to update subject visit"**
   - **Cause**: API data mapping issues
   - **Solution**: Verify request body matches expected format

## Performance Considerations

### Database Indexes
```sql
-- Core performance indexes
CREATE INDEX idx_subject_visits_study_id ON subject_visits(study_id);
CREATE INDEX idx_subject_visits_ip_id ON subject_visits(ip_id);
CREATE INDEX idx_drug_compliance_subject_ip ON drug_compliance(subject_id, ip_id);
CREATE INDEX idx_drug_compliance_subject_ip_dates ON drug_compliance(
    subject_id, ip_id, dispensing_date, ip_last_dose_date
);
```

### Query Optimization
- Use the unique constraint on `(subject_id, ip_id)` for fast compliance lookups
- Leverage generated columns for real-time compliance calculations
- Use transactional functions to minimize round trips

## Future Enhancements

### Planned Features
1. **Custom Dosing Support**: Allow decimal dose frequencies for complex protocols
2. **Compliance Thresholds**: Study-specific compliance percentage targets  
3. **Dose Timing**: Track specific dose times for adherence analysis
4. **Bulk Operations**: Mass return processing for study closeout

### Extension Points
1. **Integration APIs**: Connect with external EDC systems
2. **Reporting**: Advanced compliance analytics and dashboards
3. **Alerts**: Automated notifications for compliance issues
4. **Mobile Support**: Field-friendly data entry interfaces

## Testing

### Test Cases Covered
- ✅ Single dose compliance calculations
- ✅ Multi-dose (BID, TID, QID) compliance calculations  
- ✅ Weekly dosing compliance calculations
- ✅ Return linkage to correct previous visits
- ✅ Transactional integrity
- ✅ Inclusive date counting
- ✅ Error handling and validation

### Test Data
Reference test script: `test-ip-fix.ts`
- Uses real study/subject/visit IDs
- Validates complete workflow end-to-end
- Confirms database state after operations

## Conclusion

The IP Accountability System provides a robust, scalable solution for drug accountability in clinical studies. With support for multi-dose protocols, proper return linkage, and comprehensive audit trails, it meets the stringent requirements of clinical research while maintaining ease of use for study coordinators.

**Key Benefits:**
- ✅ Accurate compliance calculations for any dosing frequency
- ✅ Proper audit trails with transactional integrity  
- ✅ Simplified user interface with automatic calculations
- ✅ Scalable architecture supporting complex protocols
- ✅ Complete IP lifecycle tracking from dispensing to return